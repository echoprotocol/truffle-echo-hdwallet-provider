
## Truffle Usage

You can easily use this with Truffle.

truffle-config.js:
```javascript
const EchoProvider = require('EchoProvider');

const WIF = '5JRfk9ERZMRxU556gJ4MwpuxFySiNhNANjQYShTvsHyTumJ1KzS';
const accountId = '1.2.25';
const ethRpcUrl = 'http://127.0.0.1:8092';
const echojsLibUrl = 'http://127.0.0.1:6311';

module.exports = {
  echo: {
      network_id: '*',
      skipDryRun: true,   // important to skip dry run
      provider: () =>
        new EchoProvider(
          WIF,
          accountId,
          ethRpcUrl,
          echojsLibUrl,
        )
    },
};
```
then:
  ## truffle migrate --network echo

Copyright (c) 2020 Echo Technological Solutions LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NON INFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
