#include <Arduino.h>

namespace AnyPWM {
	extern volatile byte pinLevel[12];
	void pulse();
	void analogWrite(byte pin, byte level);
	void init();
}
