import Web3 from "web3";
import ProviderEngine from "web3-provider-engine";
import ProviderSubprovider from "web3-provider-engine/subproviders/provider";
import { JSONRPCRequestPayload, JSONRPCErrorCallback } from "ethereum-protocol";
import echo, { PrivateKey, constants } from 'echojs-lib';

import EchoSubprovider from './EchoSubprovider';
import Utils from './ProviderUtils';
import { EthereumCommonTrx, EchoCommonTrxData } from './TransactionInterfaces';


class EchoProvider {
  public engine: ProviderEngine;
  private ethAddress: string;
  private echoId: string;
  private privateKey: string;
  private protocol: string;

  private waitForConnectingEchoJsLib: boolean = false;
  private isEchoJsLibConnect: boolean = false;

  constructor(
    privateKey: string,
    echoId: string,
    web3Url: string,
    echoUrl: string
  ) {

    const ethAddress = Utils.idToAddress(echoId);
    this.ethAddress = ethAddress;
    this.echoId = echoId;
    this.privateKey = privateKey;
    this.protocol = web3Url.split(':')[0] || 'http';

    this.engine = new ProviderEngine();
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
          if (!this.waitForConnectingEchoJsLib && !this.isEchoJsLibConnect) {
            this.waitForConnectingEchoJsLib = true;
            echo.connect(echoUrl).then(() => {
              this.waitForConnectingEchoJsLib = false;
              this.isEchoJsLibConnect = true;
              this.serializeTransaction(echoLikeTxParams, tmpPrivateKey, cb);
            });
          } else if (this.isEchoJsLibConnect) {
            this.serializeTransaction(echoLikeTxParams, tmpPrivateKey, cb);
          }
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

  private serializeTransaction(txParams: EchoCommonTrxData, tmpPrivateKey: string, cb: any) {
    const tx = echo.createTransaction().addOperation(...txParams)
    tx.sign(PrivateKey.fromWif(tmpPrivateKey)).then(() => {
      const rawTx = '0x' + tx.signedTransactionSerializer().toString('hex').toLowerCase();
      cb(null, rawTx);
    });
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
