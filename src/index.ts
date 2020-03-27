import Web3 from "web3";
import ProviderEngine from "web3-provider-engine";
import ProviderSubprovider from "web3-provider-engine/subproviders/provider";
import { JSONRPCRequestPayload, JSONRPCErrorCallback } from "ethereum-protocol";
import { PrivateKey, constants, Transaction } from 'echojs-lib';
import { parallel } from 'async';
import { promisify } from "util";
import { WebsocketProvider } from "web3-core";

import EchoSubprovider from './EchoSubprovider';
import Utils from './ProviderUtils';
import { EthereumCommonTrx, EchoCommonTrxData } from './TransactionInterfaces';

interface EchoProviderOptions {
  accounts?: { [accountId: string]: PrivateKey | string };
  syncAccountsWithTestrpc?: boolean | "always";
  startRequestId?: number;
  debug?: boolean;
}

class EchoProvider {

  public readonly protocol: string;
  public readonly shouldSyncAccountsWithTestrpc: boolean | "always";

  public get accountsSyncedWithTestrpc() { return this._accountsSyncedWithTestrpc; }
  private _accountsSyncedWithTestrpc = false;

  private engine: ProviderEngine;
  private web3: Web3;
  private accounts: { [ethAddress: string]: PrivateKey };
  private requestId: number;

  constructor(web3Url: string, options: EchoProviderOptions = {}) {
    const accounts = options.accounts || {};
    this.protocol = web3Url.split(':')[0] || 'http';
    const engine = new ProviderEngine();
    const handler = {
      get: (obj: any, prop: any) => prop === 'silent' ? false : obj[prop],
    }
    this.engine = new Proxy(engine, handler);
    this.shouldSyncAccountsWithTestrpc = options.syncAccountsWithTestrpc || false;
    this.requestId = options.startRequestId === undefined
      ? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) : options.startRequestId;
    this.accounts = {};
    for (const accountId in accounts) {
      const rawPrivateKey = accounts[accountId];
      const privateKey = typeof rawPrivateKey === "string" ? PrivateKey.fromWif(rawPrivateKey) : rawPrivateKey;
      this.accounts[Utils.idToAddress(accountId)] = privateKey;
    }
    this.engine.addProvider(
      new EchoSubprovider({
        debug: options.debug,
        getAccounts: async (cb?: (err: unknown, accounts?: string[]) => unknown) => {
          try {
            await this.syncAccountsWithTestrpc();
          } catch (error) {
            if (cb) return cb(error);
            throw error;
          }
          const result = Object.keys(this.accounts);
          cb && cb(null, result);
          return result;
        },
        signTransaction: async (txParams: EthereumCommonTrx, cb?: (err: unknown, res?: unknown) => unknown) => {
          let result;
          try {
            await this.syncAccountsWithTestrpc();
            const from = txParams.from.toLowerCase();
            const privateKey: PrivateKey | undefined = this.accounts[from];
            if (!privateKey) throw new Error("Account not found");
            const echoLikeTxParams = this.normalizeParams(txParams);
            const res: any = await promisify(this.getExtraChainData.bind(this))(txParams);
            const fee = res.gas;
            const chainIdUnhandle = res.id;
            const chainId = chainIdUnhandle.slice(2);
            const head_block_number = res.block.number.toString();
            const head_block_id = res.block.hash.slice(26);
            const head_block_time = res.block.timestamp;
            echoLikeTxParams[1].fee = { asset_id: '1.3.0', amount: fee };
            const tx: any = new Transaction().addOperation(...echoLikeTxParams);
            tx.chainId = chainId;
            tx.refBlockNum = Number(head_block_number);
            tx.refBlockPrefix = head_block_id;
            tx.expiration = Math.max(Math.floor(Date.now() / 1e3), head_block_time);
            if (options.debug) {
              console.log();
              console.log("ETH:", txParams);
              console.log("OP: ", echoLikeTxParams);
              console.log("TX: ", {
                chainId: tx.chainId,
                refBlockNum: tx.refBlockNum,
                refBlockPrefix: tx.refBlockPrefix,
                expiration: tx.expiration,
              });
              console.log();
            }
            result = await promisify(this.serializeTransaction.bind(this))(tx, privateKey);
          } catch (error) {
            if (cb) return cb(error);
            throw error;
          }
          if (cb) cb(null, result);
          return result;
        }
      })
    );

    let subProvider;
    switch (this.protocol) {
      case "ws":
      case "wss":
        subProvider = new Web3.providers.WebsocketProvider(web3Url);
        break;
      default:
        subProvider = new Web3.providers.HttpProvider(web3Url, {
          keepAlive: false
        });
        break;
    }
    this.engine.addProvider(new ProviderSubprovider(subProvider));
    this.engine.start();
    // @ts-ignore
    const web3Provider = this as WebsocketProvider;
    this.web3 = new Web3(web3Provider);
    this.web3.extend({ methods: [{ name: 'chainId', call: 'eth_chainId' }] });
  }

  public async syncAccountsWithTestrpc(): Promise<void> {
    if (
      !this.shouldSyncAccountsWithTestrpc ||
      (this.accountsSyncedWithTestrpc && this.shouldSyncAccountsWithTestrpc !== "always")
    ) return;
    const accounts: { address: string; privkey: string }[] = await promisify(this.send.bind(this))({
      jsonrpc: "2.0",
      id: this.requestId++,
      method: "personal_listRawAccounts",
      params: [],
    }).then((res) => {
      if (res === undefined) throw new Error("personal_listRawAccounts not returns data");
      return res.result;
    });
    for (const { address, privkey } of accounts) {
      this.accounts[address] = PrivateKey.fromBuffer(Buffer.from(privkey.slice(2), "hex"));
    }
    this._accountsSyncedWithTestrpc = true;
  }

  private serializeTransaction(tx: any, rawPrivateKey: string | PrivateKey, cb: any) {
    const privateKey = typeof rawPrivateKey === "string" ? PrivateKey.fromWif(rawPrivateKey) : rawPrivateKey;
    tx.sign(privateKey).then(() => {
      const rawTx = tx.signedTransactionSerializer().toString('hex');
      cb(null, rawTx);
    });
  }

  private getExtraChainData(txParams: EthereumCommonTrx, cb: any) {
    parallel({
      block: (cb: any) => this.web3.eth.getBlock('latest', true, cb),
      gas: (txParams.to && txParams.data) ? (cb: any) => this.web3.eth.estimateGas({
        from: txParams.from,
        data: txParams.data,
        to: txParams.to,
        value: txParams.value || 0,
      }, cb) : (cb: any) => this.web3.eth.estimateGas({
        from: txParams.from,
        data: txParams.data,
        value: txParams.value || 0,
      }, cb),
      id: (cb) => (this.web3 as any)['chainId'](cb),
    }, cb);
  }

  private normalizeParams(txParams: EthereumCommonTrx): EchoCommonTrxData {
    const from = Utils.addressToId(txParams.from);
    if (txParams.to && txParams.data) {
      const contractId = Utils.addressToId(txParams.to);
      return [constants.OPERATIONS_IDS.CONTRACT_CALL, {
        registrar: from,
        value: {
          asset_id: '1.3.0',
          amount: txParams.value || 0,
        },
        code: txParams.data.substring(2),
        eth_accuracy: false,
        callee: contractId,
      }];
    } else if (txParams.data && !txParams.to) {
      return [constants.OPERATIONS_IDS.CONTRACT_CREATE, {
        registrar: from,
        value: {
          asset_id: '1.3.0',
          amount: txParams.value || 0,
        },
        code: txParams.data.substring(2),
        eth_accuracy: false,
      }];
    } else if (!txParams.data && txParams.to) {
      const receiverId = Utils.addressToId(txParams.to);
      return [constants.OPERATIONS_IDS.TRANSFER, {
        from,
        to: receiverId,
        amount: {
          asset_id: '1.3.0',
          amount: txParams.value || 0
        },
        extensions: [],
      }];
    } else {
      throw new Error('Invalid Eth trx');
    }
  }

  public send(
    payload: JSONRPCRequestPayload,
    callback: JSONRPCErrorCallback
  ): void {
    return this.engine.send(payload, callback);
  }

  public sendAsync(
    payload: JSONRPCRequestPayload,
    callback: JSONRPCErrorCallback
  ): void {
    this.engine.sendAsync(payload, callback);
  }
}

export = EchoProvider;
