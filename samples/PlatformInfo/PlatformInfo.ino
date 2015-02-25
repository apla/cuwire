/*
	ReadAnalogVoltage
	Reads an analog input on pin 0, converts it to voltage, and prints the result to the serial monitor.
	Attach the center pin of a potentiometer to pin A0, and the outside pins to +5V and ground.

 This example code is in the public domain.
 */

#ifdef __RFduino__
#include <RFduinoBLE.h>
#endif

#ifdef __AVR__
#elif __RFduino__
#endif

#include "voltage.h"
#include "led.h"

// the setup routine runs once when you press reset:
void setup() {
	// initialize serial communication at 9600 bits per second:
	Serial.begin(9600);

	setupVcc();
	setupLed();
	startLed();
}

int delaySeconds = 5;

int cyclesPassed = delaySeconds * 10;

// the loop function runs over and over again forever
void loop() {

	cyclesPassed -= 1;
	if (!cyclesPassed) {
		cyclesPassed = delaySeconds * 10;
		long voltage = readVcc();
		// print out the value you read:
		Serial.print(voltage);
		Serial.println(" mV");
	}
	// Convert the analog reading (which goes from 0 - 1023) to a voltage (0 - 5V):

	delay(100);
}

void serialEvent() {
	char inChar;
	while (Serial.available()) {
		// get the new byte:
		inChar = (char)Serial.read();
//		if (inChar == '`')
//		{
//			// add it to the inputString:
//			inputString += inChar;
//			// if the incoming character is a newline, set a flag
//			// so the main loop can do something about it:
//			if (inChar == '|') {
//				settingsReceived = true; // <----- This will never be called
//				Serial.println("true"); // <------ Nor this will too
//			}
//		}
	}
	if (inChar >= '1' && inChar <= '7') {
		delaySeconds = inChar - '0';

		Serial.print ("Now delay is ");
		Serial.print (delaySeconds);
		Serial.println (inChar == '1' ? " second": " seconds");
	}
}
