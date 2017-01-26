"use strict"

const {EventEmitter} = require('events');
const net = require('net');

const ACK = 'ACK';
const NAK = 'NAK';

class Device extends EventEmitter {
  constructor(host='localhost', port=9990, ping=1000){
    super();
    this._host = host;
    this._port = port;
    this._ping = ping;

    this._lastPromise = Promise.resolve();
    this._cmds = [];
  }

  connect(){
    if(this._connection) return this._connection;

    return this._connection = new Promise((resolve, reject)=>{
      let connection = net.connect(this._port, this._host, ()=>{
        resolve(connection);
      });
      connection.on('data', (data)=>{
        let blocks = data = data.toString().trim().split('\n\n');
        blocks.forEach((block)=>{
          connection.emit('block', Command.fromBlock(block));
        })
      });
      connection.on('error', (err)=>{
        this._connection = null;
        reject(err);
      });
      connection.on('close', (err)=>{
        this._connection = null;
      });
    });
  }

  disconnect(){
    if(!this.connected) return Promise.resolve();
    return this.connect().then((connection)=>{
      this._connection = null;
      connection.end();
    });
  }

  get connected(){
    return !!this._connection;
  }

  //** DEVICE INFO **//
  getProtocol(){
    return this._sendCommand('PROTOCOL PREAMBLE');
  }

  getDeviceInformation(){
    return this._sendCommand('VIDEOHUB DEVICE');
  }

  //** INPUTS **//
  getInputLabels(){
    return this._sendCommand('INPUT LABELS');
  }

  setInputLabel(input, label=''){
    return this._sendCommand('INPUT LABELS', {[input]: label});
  }

  //** OUTPUTS **//
  getOutputLabels(){
    return this._sendCommand('OUTPUT LABELS');
  }

  setOutputLabel(input, label=''){
    return this._sendCommand('OUTPUT LABELS', {[input]: label});
  }

  //** ROUTING **//
  getRoutes(){
    return this._sendCommand('VIDEO OUTPUT ROUTING');
  }

  setRoute(input, output){
    return this._sendCommand('VIDEO OUTPUT ROUTING', {[input]: output});
  }


  _sendCommand(cmd, data={}){
    let command = this._findCommand(cmd, data);

    if(command) console.log('reusing command', command)

    //alreday exsists, retur that one
    if(command) return command.promise;

    command = new Command(cmd, data);
    this._cmds.push(command);

    return this._lastPromise = this._lastPromise.then(()=>{
      return this.connect();
    }).then((connection)=>{
      let command = this._cmds.shift();
      if(command) return command.send(connection);
      return Promise.resolve();
    })
  }

  _findCommand(cmd, data){
    let found = this._cmds.find((elem)=>{
      if(elem.cmd!=cmd) return false;
      return elem.appendData(data);
    });
    return found;
  }
}

class Command {
  constructor(cmd, data={}){
    this.cmd = cmd;
    this.data = data;
  }

  get isRequest(){
    return Object.keys(this.data).length==0;
  }

  get promise(){
    if(this._promise) return this._promise;
    return this._promise = new Promise((resolve, reject)=>{
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  appendData(data={}){
    //this is a request but the new data isn't
    if(this.isRequest != Object.keys(data).length==0) return false;
    Object.assign(this.data, data);
    return true;
  }

  send(connection){
    let promise = this.promise;

    let resolve = this._resolve;
    let reject = this._reject;
    let cmd = this.cmd;

    let ack = false;

    let blockHandler = function(command){

      //invalid command sent
      if(command==NAK) return reject(command);

      //got a reutlt, but not acknowleged yet
      if(!ack){
        ack = command==ACK;
        if(!ack) return this.once('block', blockHandler);
      }

      if(command && command.cmd==cmd) return resolve(command.data);

      return this.once('block', blockHandler);
    }

    //connect and send!
    connection.once('block', blockHandler);
    connection.write(this.toString());

    return promise;
  }

  toString(){
    let lines = [this.cmd + ':'];
    for(let key in this.data){
      lines.push(key + ' ' + this.data[key]);
    }
    return lines.join('\n')+'\n\n';
  }
}

Command.fromBlock = function(block){
  block = block.trim();
  if(block==NAK || block==ACK) return block;

  if(block==NAK || block==ACK) return block;

  let lines = block.split('\n');
  let cmd = lines.shift();
  cmd = cmd.substr(0, cmd.length-1);

  if(lines.length==0) return {cmd};

  let data = {};
  lines.forEach((line)=>{
    let match;
    if(match=/^(\d+) (.*)/.exec(line)){
      data[match[1]] = normalizeValue(match[2]);
      return;
    }
    if(match=/^(.+): (.*)/.exec(line)){
      data[normalizeKey(match[1])] = normalizeValue(match[2]);
    }
  });

  return {
    cmd, data
  }
}

function normalizeKey(key){
  return key.replace(/ /g, '_').toLowerCase();
}

function normalizeValue(value){
  if(value=='true') return true;
  if(value=='false') return false;
  if(parseInt(value)==value) return parseInt(value);
  return value;
}

module.exports = Device;
