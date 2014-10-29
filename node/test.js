var ard = require ('./arduino');

var arduino = new ard (["/Applications/devel/Arduino.app"]);

arduino.on ('done', function () {
	var platformName = "arduino/avr";

	var boardId = "pro";

	var cpuId = "16MHzatmega328";

	arduino.compile (
		"/Users/apla/work/com.domtale/arduino/Sensor", // sketch folder
		platformName, boardId, {
			cpu: cpuId
		}, {
			// build folder
			buildFolder: "/Users/apla/Library/Application Support/Brackets/extensions/user/brackets-arduino/build"
		}
	);

	var secondRun = false;

	arduino.on ('compiled', function () {
		if (secondRun)
			return;
		secondRun = true;
		arduino.compile (
			"/Users/apla/work/com.domtale/arduino/Sensor", // sketch folder
			platformName, boardId, {
				cpu: cpuId
			}, {
				// build folder
				buildFolder: "/Users/apla/Library/Application Support/Brackets/extensions/user/brackets-arduino/build"
			}
		);
	});
});
