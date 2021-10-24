const SpiceAPI = (() => {
  const BUFFER_SIZE = 1024 * 8;

  // ----------------
  //   API WRAPPERS
  // ----------------
  class Buttons {
    constructor(spice) {
      this.spice = spice;
    }

    async write(button, state) {
      if (Array.isArray(button) && state == null) {
        return this.spice.request('buttons', 'write', button);
      } else {
        return this.spice.request('buttons', 'write', [button, state]);
      }
    }

    async read() {
      return this.spice.request('buttons', 'read');
    }

    async reset() {
      return this.spice.request('buttons', 'write_reset');
    }
  }

  // ----------------
  //    ENCRYPTION
  // ----------------
  class RC4 {
    constructor(pass) {
      this.a = 0;
      this.b = 0;
      this.key = new TextEncoder('utf-8').encode(pass);
      this.box = new Uint8Array(256);

      for (let i = 0; i < 256; i++) {
        this.box[i] = i;
      }

      let j = 0;
      for (let i = 0; i < 256; i++) {
        j = (j + this.box[i] + this.key[i % this.key.byteLength]) % 256;

        const tmp = this.box[i];
        this.box[i] = this.box[j];
        this.box[j] = tmp;
      }
    }

    crypt(inData) {
      for (let i = 0; i < inData.length; i++) {
        this.a = (this.a + 1) % 256;
        this.b = (this.b + this.box[this.a]) % 256;

        const tmp = this.box[this.a];
        this.box[this.a] = this.box[this.b];
        this.box[this.b] = tmp;

        inData[i] ^= this.box[(this.box[this.a] + this.box[this.b]) % 256];
      }
    }
  }

  // ----------------
  //       API
  // ----------------
  class SpiceAPI {
    constructor() {
      this.dataBuffer = new Uint8Array(BUFFER_SIZE);
      this.dataLen = 0;

      this.lastId = 0;
      this.requests = [];
      this.waitingForResponse = false;

      this.onopen = null;
      this.onerror = null;

      // Setup APIs
      this.buttons = new Buttons(this);
    }

    connect(host, port, pass, secure = true) {
      this.dataLen = 0;
      this.requests.splice(0, this.requests.length);
      this.waitingForResponse = false;

      if (pass != null) {
        this.pass = new RC4(pass);
      } else {
        this.pass = null;
      }
      console.log('connecting');
      try {
        this.ws = new WebSocket(`ws://${host}:${port + 1}`);
        this.ws.binaryType = 'arraybuffer';
        this.ws.onopen = async () => {
          if (secure) {
            const timeout = setTimeout(() => {
              this.close();
              console.log('spice api timed out');
              if (this.onerror) this.onerror('timeout');
            }, 1000);

            const res = await this.requestWithID(
              Math.floor(Math.random() * 2147483648),
              'control',
              'session_refresh'
            );
            clearTimeout(timeout);
            this.changePass(res);
          }

          if (this.onopen) {
            console.log('spice api connected');
            this.onopen();
          }
        };
        this.ws.onmessage = msg => {
          const content = msg.data;

          if (content instanceof ArrayBuffer) {
            if (this.dataLen + content.byteLength >= BUFFER_SIZE) {
              this.close();
              return;
            }

            const data = new Uint8Array(content);
            if (this.pass) {
              this.pass.crypt(data);
            }

            this.dataBuffer.set(data, this.dataLen);
            this.dataLen += content.byteLength;

            let processed = false;
            for (let i = 0; i < this.dataLen; i++) {
              if (this.dataBuffer[i] === 0) {
                const msg = this.dataBuffer.subarray(0, i);

                if (msg.length > 0) {
                  // convert msg to JSON
                  try {
                    const json = new TextDecoder('utf-8').decode(msg);
                    const obj = JSON.parse(json);
                    let req = null;
                    while ((req == null || req.body.id != obj.id) && this.requests.length > 0) {
                      req = this.requests.shift();
                      processed = true;
                    }
                    if (req) {
                      req.callback(obj.data, obj.errors);
                    }
                  } catch (e) {
                    // clear request
                    this.dataLen = 0;
                    this.requests.splice(0, this.requests.length);
                    console.error(e);
                  }
                }

                // remove range [0, i) from dataBuffer
                this.dataBuffer.set(this.dataBuffer.subarray(i + 1, this.dataLen));
                this.dataLen = this.dataLen - i - 1;
              }
            }

            if (processed) {
              this.waitingForResponse = false;
              this.processRequest();
            }
          }
        };
        this.ws.onclose = e => {
          console.log('connection closed');
        };

        this.ws.onerror = e => {
          console.log('ws error: ' + e);
          if (this.onerror) {
            this.onerror(e);
          }
          this.close();
        };
      } catch (e) {
        if (this.onerror) {
          this.onerror(e);
          this.close();
        }
      }
    }

    changePass(pass) {
      this.pass = new RC4(pass);
    }

    close() {
      this.waitingForResponse = false;
      if (this.ws) this.ws.close();
      this.dataLen = 0;
    }

    isConnected() {
      return this.ws.readyState === WebSocket.OPEN;
    }

    async requestWithID(id, module, func, ...params) {
      const promise = new Promise((resolve, reject) => {
        const request = {
          body: {
            id: id,
            module: module,
            function: func,
            params: params || [],
          },
          callback: (data, errors) => {
            if (errors && Array.isArray(errors) && errors.length > 0) {
              reject(errors);
            } else {
              resolve(data);
            }
          },
        };
        this.requests.push(request);
        this.processRequest();
      });

      return promise;
    }

    processRequest() {
      if (
        this.ws.readyState === WebSocket.OPEN &&
        this.requests.length > 0 &&
        this.waitingForResponse === false
      ) {
        this.waitingForResponse = true;
        const request = this.requests[0];
        const json = JSON.stringify(request.body) + '\x00';
        const buf = new TextEncoder('utf-8').encode(json);
        if (this.pass) {
          this.pass.crypt(buf);
        }
        this.ws.send(buf);
      }
    }

    async request(module, func, ...params) {
      if (++this.lastId > 2147483647) {
        this.lastId = 1;
      }
      return this.requestWithID(this.lastId, module, func, ...params);
    }
  }

  return SpiceAPI;
})();
