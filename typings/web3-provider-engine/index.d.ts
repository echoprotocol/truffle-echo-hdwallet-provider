import {
  Provider,
  JSONRPCRequestPayload,
  JSONRPCResponsePayload,
  JSONRPCErrorCallback
} from "ethereum-protocol";

interface Web3ProviderEngineOptions {
  pollingInterval?: number;
  blockTracker?: any;
  blockTrackerProvider?: any;
}
declare class Web3ProviderEngine implements Provider {
  constructor(options?: Web3ProviderEngineOptions);
  on(event: string, handler: () => void): void;
  send(
    payload: JSONRPCRequestPayload,
    callback?: JSONRPCErrorCallback
  ): void;
  sendAsync(
    payload: JSONRPCRequestPayload,
    callback: JSONRPCErrorCallback
  ): void;
  addProvider(provider: any): void;
  // start block polling
  start(callback?: () => void): void;
  // stop block polling
  stop(): void;
}
export default Web3ProviderEngine;
