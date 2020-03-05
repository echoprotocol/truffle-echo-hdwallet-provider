import Web3 from "web3";
import ProviderEngine from "web3-provider-engine";
import ProviderSubprovider from "web3-provider-engine/subproviders/provider";
import { JSONRPCRequestPayload, JSONRPCErrorCallback } from "ethereum-protocol";
import echo, { PrivateKey, constants, Transaction } from 'echojs-lib';
import { parallel } from 'async';

import EchoSubprovider from './EchoSubprovider';
import Utils from './ProviderUtils';
import { EthereumCommonTrx, EchoCommonTrxData } from './TransactionInterfaces';


class EchoProvider {
  public engine: ProviderEngine;
  private web3: Web3;
  private ethAddress: string;
  private echoId: string;
  private privateKey: string;
  private protocol: string;

  constructor(
    privateKey: string,
    echoId: string,
    web3Url: string,
  ) {
    this.ethAddress = Utils.idToAddress(echoId);
    this.echoId = echoId;
    this.privateKey = privateKey;
    this.protocol = web3Url.split(':')[0] || 'http';

    this.engine = new ProviderEngine();
    this.web3 = new Web3('ws' + web3Url.substring(web3Url.indexOf(':')));

    this.web3.extend({
      methods: [{
        name: 'chainId',
        call: 'eth_chainId',
      }]
    });

    const tmpEthAddress = this.ethAddress;
    const tmpPrivateKey = this.privateKey;

    this.engine.addProvider(
      new EchoSubprovider({
        getAccounts: (cb: any) => {
          cb(null, [tmpEthAddress]);
        },
        signTransaction: (txParams: EthereumCommonTrx, cb: any) => {
          const from = txParams.from.toLowerCase();
          if (tmpEthAddress.toLowerCase() !== from) {
            return cb && cb('Account not found');
          }
          const echoLikeTxParams = this.normalizeParams(txParams);
          this.getExtraChainData(txParams, (err: Error | null | undefined, res: any) => {
            if (err) return cb(err);
            const fee = res.gas;
            const chainIdUnhandle = res.id;
            const chainId = chainIdUnhandle.slice(2);
            const head_block_number = res.block.number.toString();
            const head_block_id = res.block.hash.slice(26);

            echoLikeTxParams[1].fee = {
              asset_id: '1.3.0', amount: fee
            }
            const tx: any = new Transaction().addOperation(...echoLikeTxParams);
            tx.chainId = chainId;
            tx.refBlockNum = Number(head_block_number);
            tx.refBlockPrefix = head_block_id;
            this.serializeTransaction(tx, tmpPrivateKey, cb)
          });
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
  }

  private serializeTransaction(tx: any, tmpPrivateKey: string, cb: any) {
    tx.sign(PrivateKey.fromWif(tmpPrivateKey)).then(() => {
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
      }, cb) : (cb: any) => this.web3.eth.estimateGas({
        from: txParams.from,
        data: txParams.data,
        value: txParams.value || 0,
      }, cb),
      id: (cb) => (this.web3 as any)['chainId'](cb),
    }, cb);
  }

  private normalizeParams(txParams: EthereumCommonTrx): EchoCommonTrxData {
    if (txParams.to && txParams.data) {
      const contractId = Utils.addressToId(txParams.to);
      return [constants.OPERATIONS_IDS.CONTRACT_CALL, {
        registrar: this.echoId,
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
        registrar: this.echoId,
        value: {
          asset_id: '1.3.0',
          amount: 0
        },
        code: txParams.data.substring(2),
        eth_accuracy: false,
      }];
    } else if (!txParams.data && txParams.to) {
      const receiverId = Utils.addressToId(txParams.to);
      return [constants.OPERATIONS_IDS.TRANSFER, {
        from: this.echoId,
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
