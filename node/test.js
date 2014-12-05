var ArduinoData = require ('./data');

var ArduinoCompiler = require ('./compiler');

var arduino = new ArduinoData (["/Applications/devel/Arduino.app"]);

var builds = {
	sensor: {
		sketch: "/Users/apla/work/com.domtale/arduino/Sensor",
		platformId: "arduino/avr",
		boardId: "pro",
		variant: {
			cpu: "16MHzatmega328"
		},
		includes: []
	},
	reprap: {
		sketch: "/Users/apla/work/3d/RepRapFirmware",
		platformId: "arduino/sam",
		boardId: "arduino_due_x_dbg",
		variant: {
		},
		includes: [
			"/Users/apla/work/3d/RepRapFirmware/network",
			"/Users/apla/Documents/Arduino/libraries/Lwip",
			"/Users/apla/Documents/Arduino/libraries/EMAC"
		]
	},
	marlin: {
		sketch: "/Users/apla/work/3d/Marlin/Marlin",
		platformId: "arduino/avr",
		boardId: "mega",
		variant: {
			cpu: "atmega2560"
		},
		includes: []
	}
};

arduino.on ('done', function () {
	var buildName = process.argv[2] || "sensor";

	var buildMeta = builds[buildName];

	var compiler = new ArduinoCompiler (
		buildMeta.sketch,
		buildMeta.platformId,
		buildMeta.boardId,
		buildMeta.variant,
		{
			// build folder
			buildFolder: "/Users/apla/Library/Application Support/Brackets/extensions/user/brackets-arduino/build",
			includes: buildMeta.includes
		}
	);

	var secondRun = false;

	compiler.on ('compiled', function () {
		if (secondRun)
			return;
		secondRun = true;
		compiler = new ArduinoCompiler (
			buildMeta.sketch,
			buildMeta.platformId,
			buildMeta.boardId,
			buildMeta.variant,
			{
				// build folder
				buildFolder: "/Users/apla/Library/Application Support/Brackets/extensions/user/brackets-arduino/build"
			}
		);
	});
});
