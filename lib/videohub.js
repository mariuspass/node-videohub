var util	= require('util'),
	net		= require('net'),
	events	= require('events'),
	extend	= require('extend'),
	command = require('./command');

var Videohub = function(host, options){
	if(typeof host==='object' && !options){
		options = host;
	}else if(host){
		this.options.host = host;
	}

	this.options = extend(this.options, options);

	this._reset();

	this._connect();
}

util.inherits(Videohub, events.EventEmitter);

Videohub.TYPES = {
	'INPUT'		: 'input',
	'OUTPUT'	: 'output',
	'SERIAL'	: 'serial',
	'MONITOR'	: 'monitor'
}

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
	this._sendCommand(new command(command.TYPES.OUTPUT_ROUTING, output.id, input.id, cb));
}

Videohub.prototype.routeMonitor = function(input, output, cb){
	var input = this.findInput(input);
	var output = this.findMonitor(output);
	if(!input || !output) return cb && cb(new Error('Input or monitor not found'));
	this._sendCommand(new command(command.TYPES.MONITORING_ROUTING, output.id, input.id, cb));
}

Videohub.prototype.routeSerial = function(input, output, cb){
	var input = this.findSerial(input);
	var output = this.findSerial(output);
	if(!input || !output) return cb && cb(new Error('Input or output serial not found'));
	this._sendCommand(new command(command.TYPES.SERIAL_ROUTING, output.id, input.id, cb));
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
	return this._findByLabelOrID(id, Videohub.TYPES.INPUT);
}

Videohub.prototype.findOutput = function(id){
	return this._findByLabelOrID(id, Videohub.TYPES.OUTPUT);
}

Videohub.prototype.findMonitor = function(id){
	return this._findByLabelOrID(id, Videohub.TYPES.MONITOR);
}

Videohub.prototype.findSerial = function(id){
	return this._findByLabelOrID(id, Videohub.TYPES.SERIAL);
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

	this._outputRoutes = [];
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

Videohub.prototype._findByLabelOrID = function(id, type, create){
	var list = this._getList(type);
	if(!list) return null;

	create = (create===true);

	for(var i=0; i<list.length; i++){
		if(typeof id=='string' && list[i].label === id) return list[i];
		if(typeof id=='number' && list[i].id === id) return list[i];
	}

	if(create && typeof id=='number'){
		var item = createItem(id, type);
		list.push(item);
		return item;
	}

	return null;
}

Videohub.prototype._findRouteTo = function(item, type, create){
	var list = this._getRouteList(type);
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

Videohub.prototype._updateLabels = function(type, labels){
	for(var i=0; i<labels.length; i++){
		var label = labels[i];
		for(var key in label){
			this._updateLabel(type, parseInt(key), label[key]);
		}
	}
}

Videohub.prototype._updateLabel = function(type, id, label){
	var item = this._findByLabelOrID(id, type, true);
	if(!item) return;
	
	if(item.label==label) return;
	item.label = label;

	this.emit(type + ' label', item);
}

Videohub.prototype._updateRoutes = function(type, routes){
	for(var i=0; i<routes.length; i++){
		var route = routes[i];
		for(var key in route){
			this._updateRoute(
				type,
				this._findByLabelOrID(parseInt(route[key]), (type!=Videohub.TYPES.SERIAL)?Videohub.TYPES.INPUT:type, true),
				this._findByLabelOrID(parseInt(key), type, true)
			);
		}
	}

}

Videohub.prototype._updateRoute = function(type, from, to){
	if(!from || !to) return;

	var route = this._findRouteTo(to, type, true);

	if(route.from == from) return;
	route.from = from;

	this.emit(type + ' route', route);
}

Videohub.prototype._updateLocks = function(type, locks){
	for(var i=0; i<locks.length; i++){
		var lock = locks[i];
		for(var key in lock){
			this._updateLock(type, parseInt(key), lock[key]);
		}
	}
}

Videohub.prototype._updateLock = function(type, id, lock){
	var item = this._findByLabelOrID(id, type, true);
	if(!item) return;
	
	if(item.lock==lock) return;
	item.lock = lock;

	this.emit(type + ' lock', item);
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
				serial: cmd.find('Serial ports')
			};
		}
		return this.emit('device', this._device);
	}

	//changed labels
	if(cmd.getType()==command.TYPES.INPUT_LABEL) return this._updateLabels(Videohub.TYPES.INPUT, cmd.getData());
	if(cmd.getType()==command.TYPES.OUTPUT_LABEL) return this._updateLabels(Videohub.TYPES.OUTPUT, cmd.getData(), 'output label');
	if(cmd.getType()==command.TYPES.MONITORING_LABEL) return this._updateLabels(Videohub.TYPES.INPUT, cmd.getData(), 'monitor label');
	if(cmd.getType()==command.TYPES.SERIAL_LABEL) return this._updateLabels(Videohub.TYPES.SERIAL, cmd.getData(), 'serial label');

	//routes
	if(cmd.getType()==command.TYPES.OUTPUT_ROUTING) return this._updateRoutes(Videohub.TYPES.OUTPUT, cmd.getData());
	if(cmd.getType()==command.TYPES.MONITORING_ROUTING) return  this._updateRoutes(Videohub.TYPES.MONITOR, cmd.getData());
	if(cmd.getType()==command.TYPES.SERIAL_ROUTING) return  this._updateRoutes(Videohub.TYPES.SERIAL, cmd.getData());

	//locks
	if(cmd.getType()==command.TYPES.OUTPUT_LOCK) return this._updateLocks(Videohub.TYPES.OUTPUT, cmd.getData());
	if(cmd.getType()==command.TYPES.MONITORING_LOCK) return this._updateLocks(Videohub.TYPES.MONITOR, cmd.getData());
	if(cmd.getType()==command.TYPES.SERIAL_LOCK) return this._updateLocks(Videohub.TYPES.SERIAL, cmd.getData());
}

Videohub.prototype.options = {
	host: 'localhost',
	port: 9990,
	ping: 1000
}

//** UTIL **//
Videohub.prototype._getList = function(type){
	switch(type){
		case Videohub.TYPES.INPUT:
			return this._inputs;
		case Videohub.TYPES.OUTPUT:
			return this._outputs;
		case Videohub.TYPES.MONITOR:
			return this._monitors;
		case Videohub.TYPES.SERIAL:
			return this._serial;
	}
	return null;
}

Videohub.prototype._getRouteList = function(type){
	switch(type){
		case Videohub.TYPES.OUTPUT:
			return this._outputRoutes;
		case Videohub.TYPES.MONITOR:
			return this._monitorRoutes;
		case Videohub.TYPES.SERIAL:
			return this._serialRoutes;
	}
	return null;
}

function createItem(id, type){
	return {
		id: parseInt(id),
		label: null,
		lock: 'U',
		type: type
	};
}

function createRoute(to){
	return {
		from: null,
		to: to
	};
}

module.exports = Videohub;