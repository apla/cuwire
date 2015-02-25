/*
	FlexiTimer2.h - Using timer2 with a configurable resolution
	Wim Leers <work@wimleers.com>

	Based on MsTimer2
	Javier Valencia <javiervalencia80@gmail.com>

	History:
	6/Jun/2014  - Added Teensy 3.0 & 3.1 support
	16/Dec/2011 - Added Teensy/Teensy++ support (bperrybap)
		   note: teensy uses timer4 instead of timer2
	25/April/10 - Based on MsTimer2 V0.5 (from 29/May/09)

	This library is free software; you can redistribute it and/or
	modify it under the terms of the GNU Lesser General Public
	License as published by the Free Software Foundation; either
	version 2.1 of the License, or (at your option) any later version.

	This library is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
	Lesser General Public License for more details.

	You should have received a copy of the GNU Lesser General Public
	License along with this library; if not, write to the Free Software
	Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
*/

#include "FlexiTimer2.h"

unsigned long FlexiTimer2::time_units;
void (*FlexiTimer2::func)();
volatile unsigned long FlexiTimer2::count;
volatile char FlexiTimer2::overflowing;
volatile unsigned int FlexiTimer2::tcnt2;
#if defined(__arm__) && defined(TEENSYDUINO)
static IntervalTimer itimer;
#endif

void FlexiTimer2::set(unsigned long ms, void (*f)()) {
	FlexiTimer2::set(ms, 0.001, f);
}

double hzFromSeconds (double seconds) {
	return 1.0/seconds;
}

/**
 * @param resolution
 *   0.001 implies a 1 ms (1/1000s = 0.001s = 1ms) resolution. Therefore,
 *   0.0005 implies a 0.5 ms (1/2000s) resolution. And so on.
 */
void FlexiTimer2::set(unsigned long units, double resolution, void (*f)()) {
	float prescaler = 0.0;

	if (units == 0)
		time_units = 1;
	else
		time_units = units;

	func = f;

	#if defined (__AVR_ATmega168__) || defined (__AVR_ATmega48__) || defined (__AVR_ATmega88__) || defined (__AVR_ATmega328P__) || defined (__AVR_ATmega1280__) || defined (__AVR_ATmega2560__) || defined(__AVR_AT90USB646__) || defined(__AVR_AT90USB1286__)
	TIMSK2 &= ~(1<<TOIE2);
	TCCR2A &= ~((1<<WGM21) | (1<<WGM20));
	TCCR2B &= ~(1<<WGM22);
	ASSR &= ~(1<<AS2);
	TIMSK2 &= ~(1<<OCIE2A);

	if ((F_CPU >= 1000000UL) && (F_CPU <= 16000000UL)) {	// prescaler set to 64
		TCCR2B |= (1<<CS22);
		TCCR2B &= ~((1<<CS21) | (1<<CS20));
		prescaler = 64.0;
	} else if (F_CPU < 1000000UL) {	// prescaler set to 8
		TCCR2B |= (1<<CS21);
		TCCR2B &= ~((1<<CS22) | (1<<CS20));
		prescaler = 8.0;
	} else { // F_CPU > 16Mhz, prescaler set to 128
		TCCR2B |= ((1<<CS22) | (1<<CS20));
		TCCR2B &= ~(1<<CS21);
		prescaler = 128.0;
	}
	#elif defined (__AVR_ATmega8__)
	TIMSK &= ~(1<<TOIE2);
	TCCR2 &= ~((1<<WGM21) | (1<<WGM20));
	TIMSK &= ~(1<<OCIE2);
	ASSR &= ~(1<<AS2);

	if ((F_CPU >= 1000000UL) && (F_CPU <= 16000000UL)) {	// prescaler set to 64
		TCCR2 |= (1<<CS22);
		TCCR2 &= ~((1<<CS21) | (1<<CS20));
		prescaler = 64.0;
	} else if (F_CPU < 1000000UL) {	// prescaler set to 8
		TCCR2 |= (1<<CS21);
		TCCR2 &= ~((1<<CS22) | (1<<CS20));
		prescaler = 8.0;
	} else { // F_CPU > 16Mhz, prescaler set to 128
		TCCR2 |= ((1<<CS22) && (1<<CS20));
		TCCR2 &= ~(1<<CS21);
		prescaler = 128.0;
	}
	#elif defined (__AVR_ATmega128__)
	TIMSK &= ~(1<<TOIE2);
	TCCR2 &= ~((1<<WGM21) | (1<<WGM20));
	TIMSK &= ~(1<<OCIE2);

	if ((F_CPU >= 1000000UL) && (F_CPU <= 16000000UL)) {	// prescaler set to 64
		TCCR2 |= ((1<<CS21) | (1<<CS20));
		TCCR2 &= ~(1<<CS22);
		prescaler = 64.0;
	} else if (F_CPU < 1000000UL) {	// prescaler set to 8
		TCCR2 |= (1<<CS21);
		TCCR2 &= ~((1<<CS22) | (1<<CS20));
		prescaler = 8.0;
	} else { // F_CPU > 16Mhz, prescaler set to 256
		TCCR2 |= (1<<CS22);
		TCCR2 &= ~((1<<CS21) | (1<<CS20));
		prescaler = 256.0;
	}
	#elif defined (__AVR_ATmega32U4__)
	TCCR4B = 0;
	TCCR4A = 0;
	TCCR4C = 0;
	TCCR4D = 0;
	TCCR4E = 0;
	if (F_CPU >= 16000000L) {
		TCCR4B = (1<<CS43) | (1<<PSR4);
		prescaler = 128.0;
	} else if (F_CPU >= 8000000L) {
		TCCR4B = (1<<CS42) | (1<<CS41) | (1<<CS40) | (1<<PSR4);
		prescaler = 64.0;
	} else if (F_CPU >= 4000000L) {
		TCCR4B = (1<<CS42) | (1<<CS41) | (1<<PSR4);
		prescaler = 32.0;
	} else if (F_CPU >= 2000000L) {
		TCCR4B = (1<<CS42) | (1<<CS40) | (1<<PSR4);
		prescaler = 16.0;
	} else if (F_CPU >= 1000000L) {
		TCCR4B = (1<<CS42) | (1<<PSR4);
		prescaler = 8.0;
	} else if (F_CPU >= 500000L) {
		TCCR4B = (1<<CS41) | (1<<CS40) | (1<<PSR4);
		prescaler = 4.0;
	} else {
		TCCR4B = (1<<CS41) | (1<<PSR4);
		prescaler = 2.0;
	}
	tcnt2 = (int)((float)F_CPU * resolution / prescaler) - 1;
	OCR4C = tcnt2;
	return;
	#elif defined(__arm__) && defined(TEENSYDUINO)
	// TODO: should this emulate the limitations and numerical
	// range bugs from the versions above?
	tcnt2 = resolution * 1000000.0;
	return;
	#elif defined(__RFduino__)
	//	http://forum.rfduino.com/index.php?topic=155.0
	//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
	//        Conversion to make cycle calculation easy
	//        Since the cycle is 32 uS hence to generate cycles in mS we need 1000 uS
	//        1000/32 = 31.25  Hence we need a multiplication factor of 31.25 to the required cycle time to achive it
	//        e.g to get a delay of 10 mS      we would do
	//        NRF_TIMER2->CC[0] = (10*31)+(10/4);
	//-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

	unsigned int ms = resolution * 1000.0;
	tcnt2 = (ms * 31) + (ms / 4);
	#elif defined(__MSP430_CPU__)
	// https://kb8ojh.net/msp430/slow_timer.html
	// http://homepages.ius.edu/RWISMAN/C335/HTML/msp430Timer.HTM
	// we using 12kHz clock
	// check 16bit overflow
	tcnt2 = resolution*12000;     // Count limit (16 bit)
	return;
	#elif defined(__TIVA__)
	ROM_SysCtlPeripheralEnable(SYSCTL_PERIPH_TIMER0);
	ROM_TimerConfigure(TIMER0_BASE, TIMER_CFG_PERIODIC);   // 32 bits Timer
	double Hz = 1.0/(resolution/10.0);   // frequency in Hz
	tcnt2 = (SysCtlClockGet() / Hz)/ 2;
	tcnt2 = (SysCtlClockGet() / 1)/ 2;
	return;
	#else
	#error Unsupported CPU type
	#endif

	tcnt2 = 256 - (int)((float)F_CPU * resolution / prescaler);
}

void TIMER2_Interrupt(void);

#if defined(__TIVA__)
void Timer0Isr(void) {
	ROM_TimerIntClear(TIMER0_BASE, TIMER_TIMA_TIMEOUT);  // Clear the timer interrupt
	FlexiTimer2::_overflow();
}
#endif

#if defined(__MSP430_CPU__)
#pragma vector=TIMER1_A0_VECTOR    // Timer1 A0 interrupt service routine
__interrupt void Timer1_A0 (void) {
	FlexiTimer2::_overflow();
}
#endif

void FlexiTimer2::start() {
	count = 0;
	overflowing = 0;
	#if defined (__AVR_ATmega168__) || defined (__AVR_ATmega48__) || defined (__AVR_ATmega88__) || defined (__AVR_ATmega328P__) || defined (__AVR_ATmega1280__) || defined(__AVR_ATmega2560__) || defined(__AVR_AT90USB646__) || defined(__AVR_AT90USB1286__)
	TCNT2 = tcnt2;
	TIMSK2 |= (1<<TOIE2);
	#elif defined (__AVR_ATmega128__)
	TCNT2 = tcnt2;
	TIMSK |= (1<<TOIE2);
	#elif defined (__AVR_ATmega8__)
	TCNT2 = tcnt2;
	TIMSK |= (1<<TOIE2);
	#elif defined (__AVR_ATmega32U4__)
	TIFR4 = (1<<TOV4);
	TCNT4 = 0;
	TIMSK4 = (1<<TOIE4);
	#elif defined(__arm__) && defined(TEENSYDUINO)
	itimer.begin(FlexiTimer2::_overflow, tcnt2);
	#elif defined(__RFduino__)
	// http://forum.rfduino.com/index.php?topic=155.0
	NRF_TIMER2->TASKS_STOP = 1;	                           // Stop timer
	NRF_TIMER2->MODE = TIMER_MODE_MODE_Timer;              // sets the timer to TIME mode (doesn't make sense but OK!)
	NRF_TIMER2->BITMODE = TIMER_BITMODE_BITMODE_16Bit;     // with BLE only Timer 1 and Timer 2 and that too only in 16bit mode
	NRF_TIMER2->PRESCALER = 9;	                           // Prescaler 9 produces 31250 Hz timer frequency => t = 1/f =>  32 uS
	// The figure 31250 Hz is generated by the formula (16M) / (2^n)
	// where n is the prescaler value
	// hence (16M)/(2^9)=31250
	NRF_TIMER2->TASKS_CLEAR = 1;                           // Clear timer

	NRF_TIMER2->CC[0] = tcnt2;              //CC[0] register holds interval count value i.e your desired cycle
	// Enable COMAPRE0 Interrupt
	NRF_TIMER2->INTENSET = TIMER_INTENSET_COMPARE0_Enabled << TIMER_INTENSET_COMPARE0_Pos;
	// Count then Complete mode enabled
	NRF_TIMER2->SHORTS = (TIMER_SHORTS_COMPARE0_CLEAR_Enabled << TIMER_SHORTS_COMPARE0_CLEAR_Pos);
	// also used in variant.cpp in the RFduino2.2 folder to configure the RTC1
	attachInterrupt(TIMER2_IRQn, TIMER2_Interrupt);
	// Start TIMER
	NRF_TIMER2->TASKS_START = 1;
	#elif defined(__MSP430_CPU__)
	TA1CTL &= ~MC1|MC0;            // stop timer A1
	TA1CTL |= TACLR;			   // clear timer A1
	// we can use different clock sources:
	//TASSEL_0  = TACLK
	//TASSEL_1  = ACLK @ 12KHz.
	//TASSEL_2  = SMCLK @ 1MHz
	//TASSEL_3  = INCLK
	TA1CTL = TASSEL_1 + MC_1;        // Timer A1 with ACLK, count UP

	TA1CCTL0 = 0x10;                 // Enable Timer A1 interrupts, bit 4=1
	TA1CCR0 = tcnt2;

	_BIS_SR(LPM0_bits + GIE);        // LPM0 (low power mode) interrupts enabled
	#elif defined(__TIVA__)
	//ROM_SysCtlClockSet(SYSCTL_SYSDIV_2_5|SYSCTL_USE_PLL|SYSCTL_XTAL_16MHZ|SYSCTL_OSC_MAIN);

	SysCtlPeripheralEnable(SYSCTL_PERIPH_TIMER0);
	//TimerIntRegister(TIMER0_BASE, TIMER_A, timer0_interrupt);
	TimerConfigure(TIMER0_BASE, TIMER_CFG_PERIODIC); //TIMER_CFG_32_BIT_PER deprecated use CFG_PERIODIC

	TimerLoadSet(TIMER0_BASE, TIMER_A, tcnt2 -1);
	//IntEnable(INT_TIMER0A);
	TimerIntEnable(TIMER0_BASE, TIMER_TIMA_TIMEOUT);
	TimerEnable(TIMER0_BASE, TIMER_A);
	TimerIntRegister(TIMER0_BASE, TIMER_A, Timer0Isr);

//	TimerIntRegister(TIMER0_BASE, TIMER_A, Timer0Isr);    // Registering  isr
//	ROM_TimerEnable(TIMER0_BASE, TIMER_A);
//	ROM_IntEnable(INT_TIMER0A);
//	ROM_TimerIntEnable(TIMER0_BASE, TIMER_TIMA_TIMEOUT);
//	ROM_TimerLoadSet(TIMER0_BASE, TIMER_A, tcnt2);
	#endif
}

void FlexiTimer2::stop() {
	#if defined (__AVR_ATmega168__) || defined (__AVR_ATmega48__) || defined (__AVR_ATmega88__) || defined (__AVR_ATmega328P__) || defined (__AVR_ATmega1280__) || defined(__AVR_ATmega2560__) || defined(__AVR_AT90USB646__) || defined(__AVR_AT90USB1286__)
	TIMSK2 &= ~(1<<TOIE2);
	#elif defined (__AVR_ATmega128__)
	TIMSK &= ~(1<<TOIE2);
	#elif defined (__AVR_ATmega8__)
	TIMSK &= ~(1<<TOIE2);
	#elif defined (__AVR_ATmega32U4__)
	TIMSK4 = 0;
	#elif defined(__arm__) && defined(TEENSYDUINO)
	itimer.end();
	#elif defined(__RFduino__)
	NRF_TIMER2->TASKS_STOP = 1;	                           // Stop timer
	NRF_TIMER2->TASKS_CLEAR = 1;                           // Clear timer
	// TODO: do i need to do more? detachInterrupt?
	#elif defined(__MSP430_CPU__)
	TA1CTL &= ~MC1|MC0;            // stop timer A1
	TA1CTL |= TACLR;			   // clear timer A1
	#elif defined(__TIVA__)
	ROM_TimerIntClear(TIMER0_BASE, TIMER_TIMA_TIMEOUT);
	#endif
}

void FlexiTimer2::_overflow() {
	count += 1;

	if (count >= time_units && !overflowing) {
		overflowing = 1;
		count = count - time_units; // subtract time_uints to catch missed overflows
		// set to 0 if you don't want this.
		(*func)();
		overflowing = 0;
	}
}

#if defined (__AVR__)
#if defined (__AVR_ATmega32U4__)
ISR(TIMER4_OVF_vect) {
	#else
	ISR(TIMER2_OVF_vect) {
		#endif
		#if defined (__AVR_ATmega168__) || defined (__AVR_ATmega48__) || defined (__AVR_ATmega88__) || defined (__AVR_ATmega328P__) || defined (__AVR_ATmega1280__) || defined(__AVR_ATmega2560__) || defined(__AVR_AT90USB646__) || defined(__AVR_AT90USB1286__)
		TCNT2 = FlexiTimer2::tcnt2;
		#elif defined (__AVR_ATmega128__)
		TCNT2 = FlexiTimer2::tcnt2;
		#elif defined (__AVR_ATmega8__)
		TCNT2 = FlexiTimer2::tcnt2;
		#elif defined (__AVR_ATmega32U4__)
		// not necessary on 32u4's high speed timer4
		#endif
		FlexiTimer2::_overflow();
	}
	#endif // AVR

#if defined(__RFduino__)
	// generate the square wave
	void TIMER2_Interrupt(void) {
		if (NRF_TIMER2->EVENTS_COMPARE[0] != 0) {
			FlexiTimer2::_overflow();
			NRF_TIMER2->EVENTS_COMPARE[0] = 0;
		}
	}
#endif
