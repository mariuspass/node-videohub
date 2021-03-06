var util	= require('util'),
	net		= require('net'),
	events	= require('events'),
	extend	= require('extend'),
	command = require('./command');

var Videohub = function(host, options){
	this.options = extend({}, Videohub.defaultOptions);
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
	var route = this._findRouteTo(output, Videohub.TYPES.OUTPUT);
	if(route.to.id==output.id && route.from.id==input.id) return cb && cb();
	this._sendCommand(new command(command.TYPES.OUTPUT_ROUTING, output.id, input.id, cb));
}

Videohub.prototype.routeMonitor = function(input, output, cb){
	var input = this.findInput(input);
	var output = this.findMonitor(output);
	if(!input || !output) return cb && cb(new Error('Input or monitor not found'));
	var route = this._findRouteTo(output, Videohub.TYPES.MONITOR);
	if(route.to.id==output.id && route.from.id==input.id) return cb && cb();
	this._sendCommand(new command(command.TYPES.MONITORING_ROUTING, output.id, input.id, cb));
}

Videohub.prototype.routeSerial = function(input, output, cb){
	var input = this.findSerial(input);
	var output = this.findSerial(output);
	if(!input || !output) return cb && cb(new Error('Input or output serial not found'));
	var route = this._findRouteTo(output, Videohub.TYPES.SERIAL);
	if(route.to.id==output.id && route.from.id==input.id) return cb && cb();
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

Videohub.prototype.getDevice = function(){
	return this._device;
}

Videohub.prototype.getInputs = function(){
	return this._getList(Videohub.TYPES.INPUT);
}

Videohub.prototype.getOutputs = function(){
	return this._getList(Videohub.TYPES.OUTPUT);
}

Videohub.prototype.getMonitors = function(){
	return this._getList(Videohub.TYPES.MONITOR);
}

Videohub.prototype.getSerials = function(){
	return this._getList(Videohub.TYPES.SERIAL);
}

Videohub.prototype.getOutputRoutes = function(){
	return this._getRouteList(Videohub.TYPES.OUTPUT);
}

Videohub.prototype.getMonitorRoutes = function(){
	return this._getRouteList(Videohub.TYPES.MONITOR);
}

Videohub.prototype.getSerialRoutes = function(){
	return this._getRouteList(Videohub.TYPES.SERIAL);
}

Videohub.prototype.isConnected = function(){
	return this._connected;
}

/** INTERNAL VARIABLES **/
Videohub.prototype._connection = null;
Videohub.prototype._data = '';
Videohub.prototype._ping = null;
Videohub.prototype._lastAck = 0;

Videohub.prototype._sentCommands = [];

Videohub.prototype._reset = function(){
	this._resetData();

	this._connected = false;
}

Videohub.prototype._resetData = function(){
	this._device = null;
	this._inputs = [];
	this._outputs = [];
	this._monitors = [];
    this._serial = [];
    this._lastAck = 0;
}


/** HANDLES **/
Videohub.prototype._onConnect = function(){
	if(this.options.ping>0){
		this._ping = setInterval(this._sendPing.bind(this), this.options.ping);
    }
	this._connected = true;
	this.emit('connect');
}

Videohub.prototype._onData = function(buffer){
	var bufferString = buffer;
	if(typeof buffer!=='string') bufferString = buffer.toString();
	this._data += bufferString;
	this._parseData();
}

Videohub.prototype._onError = function(err){
    this.emit('error');
}

Videohub.prototype._onClose = function(had_error){
	this._reset();
	this._ping = clearInterval(this._ping);
	this._connection = null;
	//clear the commands
	this._sentCommands = [];

    var delay = 0;
    if (had_error) {
        delay = Math.random() * 3000 + 1000;
    } else {
        this.emit('close');
    }

    setTimeout(this._connect.bind(this), delay);
}

Videohub.prototype._onTimeout = function(){
	this.emit('timeout');
}


/** SENDING **/
Videohub.prototype._sendCommand = function(cmd){
	if(!cmd) return;
	if(!this._connection) return cmd.error(new Error('Not connected'));

	this._sentCommands.push(cmd);
	var block = cmd.createBlock();

	this._connection.write(block);
}

/** PING **/
Videohub.prototype._sendPing = function(){
    if (this._lastAck > 0) {
        if (Date.now() - this._lastAck > this.options.ping + 1000) {
            this.emit('timeout');
            this._onClose();
            return;
        }
    }
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
		if(!list[i]) continue;
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
	var changed = false;
	for(var i=0; i<labels.length; i++){
		var label = labels[i];
		for(var key in label){
			changed = this._updateLabel(type, parseInt(key), label[key]) || changed;
		}
	}
	if(changed){
		this.emit(type + ' labels', this._getList(type));
	}
}

Videohub.prototype._updateLabel = function(type, id, label){
	var item = this._findByLabelOrID(id, type, true);
	if(!item) return false;

	if(item.label==label) return false;
	item.label = label;

	this.emit(type + ' label', item);
	return true;
}

Videohub.prototype._updateRoutes = function(type, routes){
	var changed = false;
	for(var i=0; i<routes.length; i++){
		var route = routes[i];
		for(var key in route){
			changed = this._updateRoute(
				type,
				this._findByLabelOrID(parseInt(route[key]), (type!=Videohub.TYPES.SERIAL)?Videohub.TYPES.INPUT:type, true),
				this._findByLabelOrID(parseInt(key), type, true)
			) || changed;
		}
	}
	if(changed){
		this.emit(type + ' routes', this._getRouteList(type));
	}
}

Videohub.prototype._updateRoute = function(type, from, to){
	if(!from || !to) return false;

	//already linked
	if(to.route.indexOf(from.id)>=0) return false

	//unlink all source to destination
	//a destination always has one route
	while(to.route.length>0){
		 var _from = this._findByLabelOrID(to.route.shift(), from.type);
		 if(!from) continue;
		 var index = _from.route.indexOf(to.id);
		 if(index>=0){
		 	_from.route.splice(index,1);
		 }
	}

	//link them
	to.route.push(from.id);
	from.route.push(to.id);

	this.emit(type + ' route', this._getRoute(to));
	return true;
}

Videohub.prototype._updateLocks = function(type, locks){
	var changed = false;
	for(var i=0; i<locks.length; i++){
		var lock = locks[i];
		for(var key in lock){
			changed = this._updateLock(type, parseInt(key), lock[key]) || changed;
		}
	}
	if(changed){
		this.emit(type + ' locks', this._getList(type));
	}
}

Videohub.prototype._updateLock = function(type, id, lock){
	var item = this._findByLabelOrID(id, type, true);
	if(!item) return false;

	if(item.lock==lock) return false;
	item.lock = lock;

	this.emit(type + ' lock', item);
	return true;
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
		if(cmd.isAck()) {
			this._lastAck = Date.now();
			return this._sentCommands.shift().ack();
		}
		if(cmd.isNak()) return this._sentCommands.shift().nak();
	}

	if(cmd.getType()==command.TYPES.PROTOCOL){
		this.protocol = cmd.find('Version');
		return this.emit('protocol', this.protocol);
	}

	if(cmd.getType()==command.TYPES.DEVICE){
		this._resetData();
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

Videohub.defaultOptions = {
	host: 'localhost',
	port: 9990,
	ping: 5000
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

Videohub.prototype._getRoute = function(destination){

	if(destination.route.length==0) return null;
	var sourceID = destination.route[0];

	var source = null;
	switch(destination.type){
		case Videohub.TYPES.OUTPUT:
		case Videohub.TYPES.MONITOR:
			source = this._findByLabelOrID(sourceID, Videohub.TYPES.INPUT);
			break;
		case Videohub.TYPES.SERIAL:
			source = this._findByLabelOrID(sourceID, Videohub.TYPES.SERIAL);
			break;
	}

	return createRoute(destination, source);
}

Videohub.prototype._getRouteList = function(type){
	var destinations = this._getList(type);

	if(!destinations) return null;

	var list = [];
	for(var i=0; i<destinations.length; i++){
		list.push(this._getRoute(destinations[i]));
	}
	return list;
}

function createItem(id, type){
	return {
		id: parseInt(id),
		label: null,
		lock: 'U',
		type: type,
		route: []
	};
}

function createRoute(to, from){
	return {
		to: to,
		from: from
	};
}

module.exports = Videohub;
