var EventEmitter = require ('events').EventEmitter;

var sp = require ("serialport");
var SerialPort = sp.SerialPort;

var util = require ('util');

var scope = 'console';

function CuwireSerial (options) {

	options = options || {};

	this.portName = options.port;
	this.baudrate = options.baudrate;

}

util.inherits (CuwireSerial, EventEmitter);

function parsePnpId (port) {
	var pnpId   = port.pnpId;
	var pnpDesc = pnpId.split ('\\');
	var pnpBus  = pnpDesc[0];

	var pnpDevice;

	if (pnpBus === 'USB') {
		pnpDevice = pnpDesc[1].split('&');
		port.serialNumber = pnpDesc[2];
	} else if (pnpBus === 'FTDIBUS') {
		pnpDevice = pnpDesc[1].split('+');
	} else {
		return;
	}

	pnpDevice.forEach (function (chunk, idx) {
		var m = chunk.match (/^(VID|PID)_([a-fA-F0-9]{4})/);
		if (pnpBus === 'FTDIBUS' && idx === 3) return port.serialNumber = chunk;
		if (!m) return;
		if (m[1] === 'VID') return port.vendorId  = m[2];
		if (m[1] === 'PID') return port.productId = m[2];
	});
}

function zFill (num, pad, radix) {
	var string = num.toString(radix);
	if (pad <= string.length) {
		return string;
	}
	return Array(pad - string.length + 1).join('0')+string;
}

function parseVidPid (port) {
	if (port.vendorId)  port.vendorId  = '0x' + zFill (parseInt (port.vendorId, 16), 4, 16);
	if (port.productId) port.productId = '0x' + zFill (parseInt (port.productId, 16), 4, 16);
}

CuwireSerial.list = function (cb) {
	sp.list(function (err, ports) {
		if (!err)
		ports.forEach(function(port) {
			if (port.pnpId) parsePnpId (port);
			parseVidPid (port);
		});
		cb (err, ports);
	});
}

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
	cb && cb (null, sp);
}

// I don't want to rely on message passing via events for high volume of data
CuwireSerial.prototype.open = function (port, baudrate, cb) {

	if (arguments.length === 1 && typeof port === "function") {
		cb       = port;
		port     = this.portName;
		baudrate = this.baudrate;

	} else if (arguments.length === 2 && typeof baudrate === "function") {
		cb       = baudrate;
		baudrate = port;
		port     = this.portName;

	}

	var sp = new SerialPort (port, {
		baudrate: baudrate
	});

	sp.on ("open", this.onOpen.bind (this, sp, cb));

	sp.on ('error', (function (err) {
		this.emit ('error', scope, err);
		this.onError && this.onError (sp, cb, err);
		// process.exit(2);
	}).bind (this));

	sp.on ('close', (function (err) {
		this.emit ('close', scope, err);
		this.onClose && this.onClose (sp, cb, err);
		// process.exit(2);
	}).bind (this));

}

CuwireSerial.waitForPortReturn = function (portName, cb, depth) {
	var timeout = 500;
	// pro micro will wait for a 8 seconds
	// if we can't get port within approximately 15 retries (reboot + 6sec)
	// probably something wrong

	if (depth > 15) {
		cb (new Error ("port not found"));
	}

	setTimeout (function() {
		function portFound (port) {
			if (port.comName === portName)
				return true;
		}
		CuwireSerial.list (function (err, ports) {
			if (ports.some (portFound)) {
				cb && cb (null);
			} else {
				CuwireSerial.waitForPortReturn (portName, cb, depth ? depth : 1);
			}
		});
	}, timeout);
}

CuwireSerial.prototype.danceSerial1200 = function (waitForPortReturn, cb) {

	var portName = this.portName;

	this.open (1200, function (err, port) {
		if (err) {
			cb && cb (new Error ("cannot open port"));
			return;
		}
		port.flush (function () {
			port.close (function (err) {
				if (err) {
					console.log ("port close error:", err);
				}
				if (waitForPortReturn) {
					CuwireSerial.waitForPortReturn (portName, cb);
				} else {
					cb && cb (null);
				}
			});
		});
	});
}

CuwireSerial.prototype.close = function (cb) {
	this.port.close();
	cb && cb ();
}

function CuwireSerialStdIO (options) {
}

util.inherits (CuwireSerialStdIO, CuwireSerial);

CuwireSerial.stdio = CuwireSerialStdIO;

var paint;

CuwireSerialStdIO.prototype.onOpen = function (sp, cb) {

	if (!paint) paint = require ('./color');

	this.port = sp;

	console.log (paint.cuwire ('console open, use Ctrl-c to exit.\r\n'));

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
		process.stdout.write (paint.yellow (buf.toString()));
	});

	cb && cb ();
}

module.exports = CuwireSerial;
