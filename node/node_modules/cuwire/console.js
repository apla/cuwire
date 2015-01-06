var EventEmitter = require ('events').EventEmitter;

var SerialPort = require ("serialport").SerialPort;

var util = require ('util');

var scope = 'console';

function CuwireSerial (options) {

	options = options || {};

	this.port     = options.port;
	this.baudrate = options.baudrate;

}

util.inherits (CuwireSerial, EventEmitter);

CuwireSerial.prototype.send = function (message) {
	if (!this.port) {
		this.emit ('error', scope, 'port closed');
		return;
	}

	if (message === undefined || message === null || message === "") {
		this.emit ('error', scope, 'no message');
		return;
	}

	this.port.write (message.toString ? message.toString() : message);
}

CuwireSerial.prototype.onOpen = function (sp, cb) {
	this.port = sp;
	cb && cb ();
}

// I don't want to rely on message passing via events for high volume of data
CuwireSerial.prototype.open = function (port, baudrate, cb) {

	if (arguments.length === 1 && typeof port === "function") {
		receiver = port;
		port     = this.port;
		baudrate = this.baudrate;
	}

	var sp = new SerialPort (port, {
		baudrate: baudrate
	});

	sp.on ("open", this.onOpen.bind (this, sp, cb));

	sp.on ('error', (function(err){
		this.emit ('error', scope, err);
		cb && cb (err);
		// process.exit(2);
	}).bind (this));

}

CuwireSerial.prototype.close = function (cb) {
	this.port.close();
	cb && cb ();
}

function CuwireSerialStdIO (options) {
}

util.inherits (CuwireSerialStdIO, CuwireSerial);

CuwireSerial.stdio = CuwireSerialStdIO;

CuwireSerialStdIO.prototype.onOpen = function (sp, cb) {

	this.port = sp;

	this.emit ('log', scope, 'Console open, use Ctr-c to exit.\r\n');

	process.stdin.setEncoding ('utf8');

	process.stdin.on ('readable', (function() {
		var chunk = process.stdin.read ();
		if (chunk !== null) {
			this.send (chunk.toString());
		}
	}).bind (this));

	process.stdin.on ('end', (function() {
		process.stdout.write ('end');
		this.close ();
	}).bind (this));


	this.port.on ('data', function (buf) {
		process.stdout.write (buf.toString());
	});

	cb && cb ();
}

module.exports = CuwireSerial;
