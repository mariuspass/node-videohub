var util	= require('util'),
	net		= require('net'),
	events	= require('events'),
	command = require('./command');

var Videohub = function(host, options){
	if(typeof host==='object' && !options){
		options = host;
	}else if(host){
		this.options.host = host;
	}

	this.options = util._extend(this.options, options);

	this._reset();

	this._connect();
}

util.inherits(Videohub, events.EventEmitter);


Videohub.prototype.protocol;
Videohub.prototype._device = false;

//** PUBLIC METHODS **//
Videohub.prototype.labelInput = function(id, label, cb){
	var input = this.findInput(id);
	if(!input) return cb && cb(new Error('Input not found'));
	this._sendCommand(new command(command.TYPES.INPUT_LABEL, input.id, label, cb));
}

Videohub.prototype.labelOutput = function(id, label, cb){
	var output = this.findOutput(id);
	if(!output) return cb && cb(new Error('Output not found'));
	this._sendCommand(new command(command.TYPES.OUTPUT_LABEL, output.id, label, cb));	
}

Videohub.prototype.labelMonitor = function(id, label, cb){
	var monitor = this.findMonitor(id);
	if(!monitor) return cb && cb(new Error('Monitor not found'));
	this._sendCommand(new command(command.TYPES.MONITORING_LABEL, monitor.id, label, cb));
}

Videohub.prototype.labelSerial = function(id, label, cb){
	var serial = this.findSerial(id);
	if(!serial) return cb && cb(new Error('Serial not found'));
	this._sendCommand(new command(command.TYPES.SERIAL_LABEL, serial.id, label, cb));
}

Videohub.prototype.routeOutput = function(input, output, cb){
	var input = this.findInput(input);
	var output = this.findOutput(output);
	if(!input || !output) return cb && cb(new Error('Input or output not found'));
	this._sendCommand(new command(command.TYPES.OUTPUT_ROUTING, input.id, output.id, cb));
}

Videohub.prototype.routeMonitor = function(input, output, cb){
	var input = this.findInput(input);
	var output = this.findMonitor(output);
	if(!input || !output) return cb && cb(new Error('Input or monitor not found'));
	this._sendCommand(new command(command.TYPES.MONITORING_ROUTING, input.id, output.id, cb));
}

Videohub.prototype.routeSerial = function(input, output, cb){
	var input = this.findSerial(input);
	var output = this.findSerial(output);
	if(!input || !output) return cb && cb(new Error('Input or output serial not found'));
	this._sendCommand(new command(command.TYPES.SERIAL_ROUTING, input, output, cb));
}

//TODO: processing units & frame buffers

//TODO: check the lock mechanism
Videohub.prototype.lockOutput = function(id, lock){
	if(lock===true) lock='L';
	if(lock===false) lock='U';
	this._sendCommand(new command(command.TYPES.OUTPUT_LOCK, id, lock, cb));
}

Videohub.prototype.lockMonitor = function(id, lock){
	if(lock===true) lock='L';
	if(lock===false) lock='U';
	this._sendCommand(new command(command.TYPES.MONITORING_LOCK, id, lock, cb));
}

Videohub.prototype.lockSerial = function(id, lock){
	if(lock===true) lock='L';
	if(lock===false) lock='U';
	this._sendCommand(new command(command.TYPES.SERIAL_LOCK, id, lock, cb));
}

//TODO: find other labels

//TODO: processing units & frame buffers

//TODO: serial port direction

//TODO: pluggable cards


Videohub.prototype.findInput = function(id){
	return this._findByLabelOrID(id, this._inputs);
}

Videohub.prototype.findOutput = function(id){
	return this._findByLabelOrID(id, this._outputs);
}

Videohub.prototype.findMonitor = function(id){
	return this._findByLabelOrID(id, this._monitors);
}

Videohub.prototype.findSerial = function(id){
	return this._findByLabelOrID(id, this._serial);
}

/** INTERNAL VARIABLES **/
Videohub.prototype._connection = null;
Videohub.prototype._data = '';
Videohub.prototype._ping = null;

Videohub.prototype._sentCommands = [];

Videohub.prototype._reset = function(){
	this._device = null;
	this._inputs = [];
	this._outputs = [];
	this._monitors = [];
	this._serial = [];

	this._videoRoutes = [];
	this._monitorRoutes = [];
	this._serialRoutes = [];
}


/** HANDLES **/
Videohub.prototype._onConnect = function(){
	if(this.options.ping>0){
		this._ping = setInterval(this._sendPing.bind(this), this.options.ping);
	}
	this.emit('connect');
}

Videohub.prototype._onData = function(buffer){
	var bufferString = buffer;
	if(typeof buffer!=='string') bufferString = buffer.toString();
	this._data += bufferString;
	this._parseData();
}

Videohub.prototype._onError = function(err){
}

Videohub.prototype._onClose = function(had_error){
	this._reset();
	this._ping = clearInterval(this._ping);
	this._connection = null;
	//clear the commands
	this._sentCommands = [];
	this.emit('close');
}

Videohub.prototype._onTimeout = function(){
}


/** SENDING **/
Videohub.prototype._sendCommand = function(cmd){
	if(!cmd) return;
	if(!this._connection) return;

	this._sentCommands.push(cmd);
	var block = cmd.createBlock();
	
	this._connection.write(block);
}

/** PING **/
Videohub.prototype._sendPing = function(){
	this._sendCommand(new command(command.TYPES.PING));
}

Videohub.prototype._connect = function(){
	this._connection = net.connect({port: this.options.port, host: this.options.host});
	this._connection.on('connect', this._onConnect.bind(this));
	this._connection.on('data', this._onData.bind(this));
	this._connection.on('error', this._onError.bind(this));
	this._connection.on('close', this._onClose.bind(this));
	this._connection.on('timeout', this._onTimeout.bind(this));
	this._connection.setNoDelay(true);
}

Videohub.prototype._findByLabelOrID = function(id, list, create){
	if(!list) return null;

	create = (create===true);

	for(var i=0; i<list.length; i++){
		if(typeof id=='string' && list[i].label === id) return list[i];
		if(typeof id=='number' && list[i].id === id) return list[i];
	}

	if(create && typeof id=='number'){
		var item = createItem(id);
		list.push(item);
		return item;
	}

	return null;
}

Videohub.prototype._findRouteTo = function(item, list, create){
	if(!list) return null;

	create = (create===true);

	for(var i=0; i<list.length; i++){
		if(list[i].to==item) return list[i];
	}

	if(create){
		var route = createRoute(item);
		list.push(route);
		return route;
	}

	return null;
}

Videohub.prototype._updateLabels = function(list, labels, eventName){
	for(var i=0; i<labels.length; i++){
		var label = labels[i];
		for(var key in label){
			this._updateLabel(list, parseInt(key), label[key], eventName);
		}
	}
}

Videohub.prototype._updateLabel = function(list, id, label, eventName){
	var item = this._findByLabelOrID(id, list, true);
	
	if(item.label==label) return;
	item.label = label;

	this.emit(eventName, item);
}

Videohub.prototype._updateRoutes = function(list, fromList, toList, routes, eventName){
	
	for(var i=0; i<routes.length; i++){
		var route = routes[i];
		for(var key in route){
			this._updateRoute(
				list,
				this._findByLabelOrID(parseInt(key), fromList, true),
				this._findByLabelOrID(parseInt(route[key]), toList, true),
				eventName);
		}
	}

}

Videohub.prototype._updateRoute = function(list, from, to, eventName){
	var route = this._findRouteTo(to, list, true);

	if(route.from == from) return;
	route.from = from;

	this.emit(eventName, from, to);
}

/** PARSING **/
Videohub.prototype._parseData = function(){
	var index;
	while((index = this._data.indexOf("\n\n"))>0){
		var block = this._data.substr(0, index);
		this._data = this._data.substr(index+2);
		this._parseBlock(block);
	}
}

Videohub.prototype._parseBlock = function(block){
	var cmd = command.parseBlock(block);

	if(!cmd) return;

	if(this._sentCommands.length!=0){
		if(cmd.isAck()) return this._sentCommands.shift().ack();
		if(cmd.isNak()) return this._sentCommands.shift().nak();
	}

	if(cmd.getType()==command.TYPES.PROTOCOL){
		this.protocol = cmd.find('Version');
		return this.emit('protocol', this.protocol);
	}

	if(cmd.getType()==command.TYPES.DEVICE){
		this._reset();
		var present = cmd.find('Device present');
		if(present=='true'){
			//we should request a dump maybe?
			this._device = {
				name: cmd.find('Model name'),
				inputs: cmd.find('Video inputs'),
				// processing_units: cmd.get('Video processing units'),
				outputs: cmd.find('Video outputs'),
				monitoring_outputs: cmd.find('Video monitoring outputs'),
				serial: cmd.get('Serial ports')
			};
		}
		return this.emit('device', this._device);
	}

	//changed labels
	if(cmd.getType()==command.TYPES.INPUT_LABEL) return this._updateLabels(this._inputs, cmd.getData(), 'input label');
	if(cmd.getType()==command.TYPES.OUTPUT_LABEL) return this._updateLabels(this._outputs, cmd.getData(), 'output label');
	if(cmd.getType()==command.TYPES.MONITORING_LABEL) return this._updateLabels(this._monitors, cmd.getData(), 'monitor label');
	if(cmd.getType()==command.TYPES.SERIAL_LABEL) return this._updateLabels(this._serial, cmd.getData(), 'serial label');

	//routes
	if(cmd.getType()==command.TYPES.OUTPUT_ROUTING) return this._updateRoutes(this._videoRoutes, this._inputs, this._outputs, cmd.getData(), 'output route');
	if(cmd.getType()==command.TYPES.MONITORING_ROUTING) return  this._updateRoutes(this._monitorRoutes, this._inputs, this._monitors, cmd.getData(), 'monitor route');
	if(cmd.getType()==command.TYPES.SERIAL_ROUTING) return  this._updateRoutes(this._serialRoutes, this._serial, this.this._serial, cmd.getData(), 'serial route');

	//locks
	if(cmd.getType()==command.TYPES.OUTPUT_LOCK) return;
	if(cmd.getType()==command.TYPES.MONITORING_LOCK) return;
	if(cmd.getType()==command.TYPES.SERIAL_LOCK) return;
}

Videohub.prototype.options = {
	host: 'localhost',
	port: 9990,
	ping: 1000
}

function createItem(id){
	return {
		id: parseInt(id),
		label: null,
		lock: 'U'
	};
}

function createRoute(to){
	return {
		from: null,
		to: to
	};
}

module.exports = Videohub;