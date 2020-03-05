export interface EthereumCommonTrx {
  from: string;
  to?: string;
  value?: string;
  data?: string;
}

interface ValueObject {
  asset_id: string;
  amount: string | number;
}

interface EchoCommonTrx {
  registrar?: string;
  from?: string;
  to?: string;
  value?: ValueObject;
  amount?: ValueObject;
  fee?: ValueObject;
  code?: string;
  callee?: string;
  eth_accuracy?: boolean;
  extensions?: Array<any>;
}

export type EchoCommonTrxData = [number, EchoCommonTrx];
