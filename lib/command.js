var Command = function(cmd, data, callback){
	var args = Array.prototype.slice.call(arguments, 0);

	//remove the command
	args.shift();

	//check for callback
	if(typeof args[args.length-1]==='function' || typeof args[args.length-1]==='undefined') this._callback = args.pop();

	if(typeof cmd==='string'){
		this._cmd = cmd;
	}

	this._data = [];
	this.addData(args);

}

Command.prototype._cmd = null;
Command.prototype._data = [];
Command.prototype._callback = null;

Command.TYPES = {
	ACK: 'ACK',
	NAK: 'NAK',
	PING: 'PING',
	PROTOCOL: 'PROTOCOL PREAMBLE',
	DEVICE: 'VIDEOHUB DEVICE',
	INPUT_LABEL: 'INPUT LABELS',
	OUTPUT_LABEL: 'OUTPUT LABELS',
	MONITORING_LABEL: 'MONITORING OUTPUT LABELS',
	SERIAL_LABEL: 'SERIAL PORT LABELS',
	OUTPUT_ROUTING: 'VIDEO OUTPUT ROUTING',
	MONITORING_ROUTING: 'VIDEO MONITORING OUTPUT ROUTING',
	SERIAL_ROUTING: 'SERIAL PORT ROUTING',
	// PROCESSING_UNIT_ROUTING: 'PROCESSING UNIT ROUTING',
	// FRAME_LABEL: 'FRAME LABELS',
	// FRAME_BUFFER_ROUTING: 'FRAME BUFFER ROUTING',
	OUTPUT_LOCK: 'VIDEO OUTPUT LOCKS',
	MONITORING_LOCK: 'MONITORING OUTPUT LOCKS',
	SERIAL_LOCK: 'SERIAL PORT LOCKS',
	// PROCESSING_UNIT_LOCK: 'PROCESSING UNIT LOCKS',
	// FRAME_BUFFER_LOCK: 'FRAME BUFFER LOCKS',
	// SERIAL_DIRECTION: 'SERIAL PORT DIRECTIONS',
	// VIDEO_INPUT_STATUS: 'VIDEO INPUT STATUS',
	// VIDEO_OUTPUT_STATUS: 'VIDEO OUTPUT STATUS',
	// SERIAL_PORT_STATUS: 'SERIAL PORT STATUS',
};


Command.prototype.addData = function(data){
	
	if(typeof data==='string'){
		data = data.trim();
		var parts = data.split(':');
		if(parts.length<2){
			parts = data.split(' ');
		}
		if(parts.length>1){
			var d = {};
			d[parts.shift()] = parts.join(' ').trim();
			this._data.push(d);
		}
		return;
	}

	if(typeof data==='object'){
		//it is not an array, so just add it
		if(!Array.isArray(data)){
			this._data.push(data);
			return;
		}

		//no use to continue
		if(data.length==0) return;

		if(data.length==2 && !isNaN(data[0])){
			var d = {};
			d[data.shift()] = data.shift();
			this._data.push(d);
			return;
		}

		for(var i=0; i<data.length; i++){
			this.addData(data[i]);
		}
	}
}

Command.prototype.getType = function(){
	return this._cmd;
}

Command.prototype.isAck = function(){
	return this.getType()==Command.TYPES.ACK;
}

Command.prototype.isNak = function(){
	return this.getType()==Command.TYPES.NAK;
}

Command.prototype.isReply = function(){
	return this.isAck() || this.isNak();
}

Command.prototype.ack = function(){
	return this._callback && this._callback();
}

Command.prototype.nak = function(){
	return this.error(new Error('NAK received'))
}

Command.prototype.error = function(err){
	return this._callback && this._callback(err);
}

Command.prototype.find = function(key){
	for(var i=0; i<this._data.length; i++){
		var obj = this._data[i];
		if(obj.hasOwnProperty(key)) return obj[key];
	}

	return null;
}

Command.prototype.getData = function(){
	return this._data;
}

//** block commands **/
Command.createBlock = function(command){
	if(!command) return null;

	var lines = [command._cmd + ':'];
	for(var i=0; i<command._data.length; i++){
		var data = command._data[i];
		for(key in data){
			if(data.hasOwnProperty(key)){
				var line = key + ' ' + data[key];
				lines.push(line);
			}
		}
	}
	lines.push('\n');
	return lines.join('\n');
}

Command.prototype.createBlock = function(){
	return Command.createBlock(this);
}

Command.parseBlock = function(block){
	block = block.trim();

	if(block.length==0) return null;

	if(block==Command.TYPES.ACK || block==Command.TYPES.NAK){
		return new Command(block);
	}

	var lines = block.split('\n');

	var cmd = lines.shift();
	if(cmd.substr(cmd.length-1)!=':') return null;

	cmd = cmd.substr(0,cmd.length-1);

	for(var CMD in Command.TYPES){
		if(Command.TYPES[CMD]==cmd){
			var command = new Command(cmd, lines);
			return command;
		}
	}
}

module.exports = Command;