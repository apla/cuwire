// http://nicks-liquid-soapbox.blogspot.ru/2011/02/anypwm-revisited.html
// AnyPWM by Nick Borko
// This work is licensed under a Creative Commons
// Attribution-ShareAlike 3.0 Unported License

// Manually do PWM using FlexiTimer2
// (http://www.arduino.cc/playground/Main/FlexiTimer2)
// actually copied from https://github.com/PaulStoffregen/FlexiTimer2
#include <Arduino.h>

#include "FlexiTimer2.h"
#include "AnyPWM.h"

// LED to pulse (non-PWM pin)
#define LED 13

// Period of the PWM wave (and therefore the number of levels)
#define PERIOD 256

// Variables to keep track of the pin states
volatile byte AnyPWM::pinLevel[12] = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };

// Set a digital out pin to a specific level
void AnyPWM::analogWrite(byte pin, byte level) {
	if (pin > 1 && pin < 14 && level >= 0 && level < PERIOD) {
		pin -= 2;
		AnyPWM::pinLevel[pin] = level;
		if (level == 0) {
			digitalWrite(pin + 2, LOW);
		}
	}
}

// Initialize the timer routine; must be called before calling
// AnyPWM::analogWrite!
void AnyPWM::init() {
	// (PERIOD * 64) Hertz seems to be a high enough frequency to produce
	// a steady PWM signal on all 12 output pins
	FlexiTimer2::set(1, 1.0/(PERIOD * 64), AnyPWM::pulse);
	FlexiTimer2::start();
}

// Routine to emit the PWM on the pins
void AnyPWM::pulse() {
	static int counter = 0;
	for(int i = 0; i < 12; i += 1) {
		if (AnyPWM::pinLevel[i]) {
			digitalWrite(i + 2, AnyPWM::pinLevel[i] > counter);
		}
	}
	counter = ++counter > PERIOD ? 0 : counter;
}
