import Subprovider from 'web3-provider-engine/subproviders/subprovider';
import { waterfall } from 'async';
import Semaphore from 'semaphore';
import { JSONRPCRequestPayload, JSONRPCResponsePayload } from "ethereum-protocol";

import { EthereumCommonTrx } from './TransactionInterfaces';

interface ConstructorOptionts {
  getAccounts: Function;
  signTransaction: Function;
  debug?: boolean;
}

class EchoSubprovider extends Subprovider {

  public debug: boolean;

  private log(payload: any, error: any, result: any): void {
    if (!this.debug) return;
    console.log();
    console.log(" >>", payload);
    console.log(" <<", error || result);
    console.log();
  }

  constructor(opts: ConstructorOptionts) {
    super();
    this.nonceLock = Semaphore(1);
    this.getAccounts = opts.getAccounts;
    this.signTransaction = opts.signTransaction;
    this.debug = !!opts.debug;

    this.handleRequest = (payload: JSONRPCRequestPayload, next: any, end: any) => {
      switch (payload.method) {
        case 'eth_accounts':
          this.getAccounts((err: Error | null, accounts: Array<string>) => {
            this.log(payload, err, accounts);
            if (err) return end(err);
            end(null, accounts);
          });
          return;

        case 'eth_signTransaction': {
          const txParams: EthereumCommonTrx = payload.params[0];
          waterfall([
            (cb: Function) => this.validateTransaction(txParams, cb),
            (txParams: EthereumCommonTrx, cb: Function) => this.processSignTransaction(txParams, cb),
          ], (err, res) => {
            this.log(payload, err, res);
            end(err, res);
          });
          return;
        }

        case 'eth_sendTransaction': {
          const txParams: EthereumCommonTrx = payload.params[0];
          waterfall([
            (cb: Function) => this.validateTransaction(txParams, cb),
            (txParams: EthereumCommonTrx, cb: Function) => this.processTransaction(txParams, cb),
          ], (err, res) => {
            this.log(payload, err, res);
            end(err, res);
          });
          return;
        }

        case 'evm_snapshot':
          // FIXME:
          const res = "0x0";
          this.log(payload, null, res);
          end(null, res);
          return;

        case 'eth_getBlockByNumber':
          if (payload.params[0] === undefined) payload.params[0] = "0x1";
          next((err: any, res: any, cb: any) => {
            if (res) res.gasLimit = "0xffffffff";
            this.log(payload, err, res);
            cb(err, res);
          });
          return;

        default:
          next((err: any, res: any, cb: any) => {
            this.log(payload, err, res);
            cb(err, res);
          });
          return;
      }
    };

    this.validateTransaction = (txParams: EthereumCommonTrx, cb: Function) => {
      if (txParams.from === undefined) return cb(new Error(`Undefined address - from address required to sign transaction.`));
      this.validateSender(txParams.from, (err: Error | null, senderIsValid: boolean) => {
        if (err) return cb(err);
        if (!senderIsValid) return cb(new Error(`Unknown address - unable to sign transaction for this address: "${txParams.from}"`));
        cb(null, txParams);
      });
    };

    this.validateSender = (senderAddress: string, cb: Function) => {
      this.getAccounts((err: Error | null, accounts: Array<string>) => {
        if (err) return cb(err);
        const senderIsValid = (accounts.map((el) => el.toLowerCase()).indexOf(senderAddress.toLowerCase()) !== -1);
        cb(null, senderIsValid);
      });
    };

    this.processSignTransaction = (txParams: EthereumCommonTrx, cb: Function) => {
      this.nonceLock.take(() => {
        waterfall([
          (cb: Function) => this.signTransaction(txParams, cb),
        ], (err: Error | null | undefined, signedTx: string | undefined) => {
          this.nonceLock.leave();
          if (err) return cb(err);
          cb(null, { raw: signedTx, tx: txParams });
        });
      });
    };

    this.processTransaction = (txParams: EthereumCommonTrx, cb: Function) => {
      this.nonceLock.take(() => {
        waterfall([
          (cb: Function) => this.signTransaction(txParams, cb),
          (rawTx: string, cb: Function) => this.publishTransaction(rawTx, cb),
        ], (err: Error | null | undefined, txHash: string | undefined) => {
          this.nonceLock.leave();
          if (err) return cb(err);
          cb(null, txHash);
        });
      });
    };

    this.publishTransaction = (rawTx: string, cb: Function) => {
      this.emitPayload({
        method: 'eth_sendRawTransaction',
        params: [rawTx],
      }, (err: Error | null | undefined, res: JSONRPCResponsePayload) => {
        if (err) return cb(err);
        cb(null, res.result);
      });
    };
  };
};

export default EchoSubprovider;
