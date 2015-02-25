// avr boards have just one led plugged to digital only pin.
// we'll use software pwm for them

// msp430 launchpad have 2 leds and 2 buttons

// stellaris launchpad have one RGB led and two buttons

// rfduino have one RGB led and two buttons on RGB shield

#include "platform.h"
#ifdef __AVR__
#include "AnyPWM.h"
#endif
#include "FlexiTimer2.h"

void setupLed () {
	#if defined(__AVR__)

	#define LED_COUNT 1
	#define LED_1 LED_BUILTIN
	#define LED_2 LED_BUILTIN
	#define LED_3 LED_BUILTIN

	// arduino boards with AVR arch doesn't have analogWrite on LED pin
	AnyPWM::init();       // initialize the PWM timer
	pinMode (LED_1, OUTPUT); // declare LED pin to be an output

	#elif defined(__RFduino__)

	// pin 2 on the RGB shield is the red led
	// pin 3 on the RGB shield is the green led
	// pin 4 on the RGB shield is the blue led

	#define LED_COUNT 3
	#define LED_1 2
	#define LED_2 3
	#define LED_3 4

	pinMode(LED_1, OUTPUT);
	pinMode(LED_2, OUTPUT);
	pinMode(LED_3, OUTPUT);


	#elif defined(__TIVA__)

	#define LED_COUNT 3
	#define LED_1 RED_LED
	#define LED_2 GREEN_LED
	#define LED_3 BLUE_LED

	pinMode(RED_LED, OUTPUT);
	pinMode(GREEN_LED, OUTPUT);
	pinMode(BLUE_LED, OUTPUT);

	pinMode(PUSH1, INPUT_PULLUP); // left - note _PULLUP
	pinMode(PUSH2, INPUT_PULLUP); // right - note _PULLUP

	#elif defined(__MSP430_CPU__)

	#define LED_COUNT 2
	#define LED_1 RED_LED
	#define LED_2 GREEN_LED
	#define LED_3 GREEN_LED

	pinMode(RED_LED, OUTPUT);
	pinMode(GREEN_LED, OUTPUT);

//	pinMode(PUSH1, INPUT_PULLUP); // left - note _PULLUP
//	pinMode(PUSH2, INPUT_PULLUP); // right - note _PULLUP

	#endif
}

byte brightness = 0;    // how bright the LED is
byte fadeAmount = 5;    // how many points to fade the LED by

uint8_t COLOR_VAL[3] = {50, 0, 0};
uint8_t amount = 1;
uint32_t colorDelay = 30;

void changeColor() {

	#if LED_COUNT == 3
		if (COLOR_VAL[0] > 0 && COLOR_VAL[1] >= 0 && COLOR_VAL[2] == 0) {
			// reduce red, increase green
			COLOR_VAL[0] -= amount;
			COLOR_VAL[1] += amount;
		} else if (COLOR_VAL[0] == 0 && COLOR_VAL[1] > 0 && COLOR_VAL[2] >= 0) {
			// reduce green, increase blue
			COLOR_VAL[1] -= amount;
			COLOR_VAL[2] += amount;
		} else {
			// reduce blue, increase red
			COLOR_VAL[2] -= amount;
			COLOR_VAL[0] += amount;
		}
		analogWrite(LED_1, COLOR_VAL[0]);
		analogWrite(LED_2, COLOR_VAL[1]);
		analogWrite(LED_3, COLOR_VAL[2]);

	#elif LED_COUNT == 2

		if (COLOR_VAL[0] == 0) {
			COLOR_VAL[2] = 0; // red rise
		} else if (COLOR_VAL[1] == 0) {
			COLOR_VAL[2] = 1; // green rise
		}

		if (COLOR_VAL[2] == 1) {
			// reduce red, increase green
			COLOR_VAL[0] -= amount;
			COLOR_VAL[1] += amount;
		} else {
			// reduce green, increase red
			COLOR_VAL[0] += amount;
			COLOR_VAL[1] -= amount;
		}

		analogWrite(LED_1, COLOR_VAL[0]);
		analogWrite(LED_2, COLOR_VAL[1]);

	#endif

}



void startLed () {
	#if defined(__AVR__)
	// set the brightness of the LED:
	AnyPWM::analogWrite(LED_1, brightness);

	// change the brightness for next time through the loop:
	brightness = brightness + fadeAmount;

	// reverse the direction of the fading at the ends of the fade:
	if (brightness == 0 || brightness == 255) {
		fadeAmount = -fadeAmount;
	}

	delay(colorDelay);

	#else
	// ti stellaris launchpad
	// look into qs_rgb example in stellarisware

	FlexiTimer2::set(1, 1000.0/colorDelay, changeColor);
	FlexiTimer2::start();

	#endif

	// wait for 30 milliseconds to see the dimming effect

	//sleep (colorDelay);

	// http://forum.stellarisiti.com/topic/1974-lm4f120-thermometer/

//	if (digitalRead(PF_4)==LOW) { blinkslow(); }
	//if (digitalRead(PF_0)==LOW) { blinkfast(); }
}
