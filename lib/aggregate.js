var util	= require('util'),
	net		= require('net'),
	events	= require('events'),
	extend	= require('extend'),
	async 	= require('async'),
	Videohub= require('./videohub');

/**

	What are we doing here?
	We add multiple devices for which some outputs have the same
	labels as the inputs of another, for now the devices have to
	be in the right order input-> output, maybe later we change this

	So when connecting, we do the following: we find the first input that matches
	then we find an output that matches following all links to find a correct route

	How do we handle routes take you might ask? We do, we first try to find a free path,
	we do this by seeing if it is already connected, if so, leave it and choose it
	if impossible we choose the one last set, we should work backwards in that case (or forwards?)

**/

var Aggregate = function(options){
	if(!Array.isArray(options)) options = [options];

	for(var i=0; i<options.length; i++){
		this._addDevice(new Videohub(options[i]));
	}

	this._connected = false;
}
util.inherits(Aggregate, events.EventEmitter);

var proto = Aggregate.prototype;
proto._devices = [];


//this should find and route the video
proto.routeOutput = function(inpt, outpt, cb){

	var device = this._findDeviceWithInput(inpt);

	if(!device){
		return cb && cb(new Error('unable to find input "' + inpt + '"'));
	}

	var route = this._findRoute(device, inpt, outpt);
	if(!route || route.length==0){
		return cb && cb(new Error('unable to find output "' + outpt + '"'));
	}

	async.eachSeries(route, function(item, callback){
		item.device.routeOutput(item.input, item.output, callback);
	}, cb);
	
}

proto.getInputs = function(){
	var inputs = [];
	for(var i=0; i<this._devices.length; i++){
		inputs = inputs.concat(this._devices[i].getInputs());
	}
	return this._filterLinks(inputs);
}

proto.getOutputs = function(addDevice){
	var outputs = [];
	for(var i=0; i<this._devices.length; i++){
		var deviceOutputs = this._devices[i].getOutputs();
		if(addDevice===true){
			for(var j=0; j<deviceOutputs.length; j++){
				deviceOutputs[j].device = this._devices[i];
			}
		}
		outputs = outputs.concat(deviceOutputs);
	}
	return this._filterLinks(outputs);
}

proto.getRoutes = function(){
	var routes = [];

	var outputs = this.getOutputs();

	for(var i=0; i<outputs.length; i++){
		var output = outputs[i];
		var route = this._findRouteTo(output, output.device);
		if(route) routes.push(route);
	}

	return routes;
}

proto.isConnected = function(){
	return this._connected;
}

proto._filterLinks = function(list){
	var l = list.length;
	var labels = this._getLinkLabels();
	while(l--){
		if(labels.indexOf(list[l].label)>=0){
			list.splice(l,1);
		}
	}
	return list;
}

proto._getLinkLabels = function(){
	var labels = [];
	for(var i=0; i<this._devices.length; i++){
		var device = this._devices[i];
		for(var l=0; l<device._links.length; l++){
			labels = labels.concat(device._links[l].inputs);
		}
	}
	return labels;
}

proto._onInputLabels = function(){
	this._updateLinks();
	this.emit('input labels', this.getInputs());
};

proto._onOutputLabels = function(){
	this._updateLinks();
	this.emit('output labels', this.getOutputs());
};

proto._onOutputRoutes = function(){
	this._updateLinks();
	this.emit('output routes', this.getRoutes());
}

proto._onConnect = function(){
	var connected = true;
	for(var i=0; i<this._devices.length; i++){
		connected = connected && this._devices[i].isConnected();
	}

	if(connected!=this._connected){
		this._connected = connected;
		this.emit((connected)?'connect':'close');
	}
}

proto._addDevice = function(device){
	device.on('input labels', this._onInputLabels.bind(this));
	device.on('output labels', this._onOutputLabels.bind(this));
	device.on('output routes', this._onOutputRoutes.bind(this));

	device.on('connect', this._onConnect.bind(this));
	device.on('close', this._onConnect.bind(this));

	device._links = [];
	this._devices.push(device);
}

proto._updateLinks = function(){
	for(var i=0; i<this._devices.length; i++){
		var device = this._devices[i];
		device._links = [];

		var outputs = device.getOutputs();

		for(var j=i+1; j<this._devices.length; j++){
			var tdevice = this._devices[j];
			if(tdevice==device) continue; //should never fire

			var link = {device: tdevice, inputs: []};

			for(var o=0; o<outputs.length; o++){
				var input = tdevice.findInput(outputs[o].label);
				if(!input) continue;
				link.inputs.push(input.label);
			}

			if(link.inputs.length>0) device._links.push(link);
		}
	}
}

proto._findDeviceWithInput = function(inpt){
	for(var i=0; i<this._devices.length; i++){
		var device = this._devices[i];
		var input = device.findInput(inpt);
		if(input) return device;
	}
}

proto._findDeviceWithOutput = function(outpt){
	for(var i=0; i<this._devices.length; i++){
		var device = this._devices[i];
		var output = device.findOutput(outpt);
		if(output) return device;
	}
}

proto._findRoute = function(device, inpts, outpt){
	if(!Array.isArray(inpts)) inpts = [inpts];	

	var route = {
		device: device,
		input: null,
		output: null
	};
	var routes = [route];

	if(device.findOutput(outpt)){
		route.output = outpt;
		route.input = this._findBestRoute(device, inpts, outpt);
		if(!route.input) return null;//invalid route
		return routes;
	}

	for(var i=0; i<device._links.length; i++){
		var link = device._links[i];
		var deepRoute = this._findRoute(link.device, link.inputs, outpt);
		if(!deepRoute || deepRoute.length==0) continue;

		var next = deepRoute[0];
		route.output = next.input;
		//push this output back, in list
		var linkIndex = link.inputs.indexOf(route.output);
		if(linkIndex>=0){
			link.inputs.splice(linkIndex, 1);
			link.inputs.push(route.output);
		}
		route.input = this._findBestRoute(device, inpts, route.output);
		if(route.input && route.output){
			return routes.concat(deepRoute);
		}
	}
	
	return null;
}

proto._findBestRoute = function(device, inpts, outpt){
	if(!Array.isArray(inpts)) inpts = [inpts];

	if(inpts.length==0) return null;

	var output = device.findOutput(outpt);
	if(!output) return null;

	//only one, so just return it
	if(inpts.length==1){
		return inpts[0];
	}

	//first see if we have a connection yet
	var connectedInput = device.findInput(output.route[0]);
	if(inpts.indexOf(connectedInput.id)>=0 || inpts.indexOf(connectedInput.label)>=0) return connectedInput.label;	

	/** this is where it gets harder, because if all connected, which one to return? **/

	//First check for unconnected ones
	for(var i=0; i<inpts.length; i++){
		var input = device.findInput(inpts[i]);
		if(input && input.route.length==0) return inpts[i]; //it has no connection
	}

	//now we just return the first one
	return inpts[0];
}


proto._findRouteTo = function(output, device){
	if(!device){
		device = this._findDeviceWithOutput(output.label);
		if(!device) return null;
		output = device.findOutput(output.label);
	}

	var route = device._findRouteTo(output, Videohub.TYPES.OUTPUT, false);

	if(!route) return null;

	var linkLabels = this._getLinkLabels();

	var fromlabel = route.from.label;
	while(linkLabels.indexOf(fromlabel)>-1){
		var r = this._findRouteTo(route.from);
		if(!r) break;
		route.from = r.from;
		fromlabel = route.from.label;
	}

	return route;
}

module.exports = Aggregate;