#ifndef FlexiTimer2_h
#define FlexiTimer2_h

#include <Arduino.h>

#ifdef __AVR__
#include <avr/interrupt.h>
#elif defined(__arm__) && defined(TEENSYDUINO)
#elif defined(__RFduino__)
#elif defined(__MSP430_CPU__)
#elif defined(__TM4C129XNCZAD__) || defined(__TM4C1294NCPDT__) || defined(__LM4F120H5QR__) || defined(__TM4C123GH6PM__)
#define __TIVA__
#include "inc/hw_ints.h"
#include "driverlib/interrupt.h"
#include "driverlib/sysctl.h"
#include "driverlib/timer.h"
#else
#error FlexiTimer2 library only works on AVR, Teensy, RFduino, msp430, TivaC
#endif


namespace FlexiTimer2 {
	extern unsigned long time_units;
	extern void (*func)();
	extern volatile unsigned long count;
	extern volatile char overflowing;
	extern volatile unsigned int tcnt2;

	void set(unsigned long ms, void (*f)());
	void set(unsigned long units, double resolution, void (*f)());
	void start();
	void stop();
	void _overflow();
}

#endif
