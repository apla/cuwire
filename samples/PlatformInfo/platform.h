// platform defines

#ifndef PLATFORM_H
#define PLATFORM_H

// __AVR__ is defined already

#ifdef ENERGIA

	#if defined(__TM4C129XNCZAD__) || defined(__TM4C1294NCPDT__) || defined(__LM4F120H5QR__) || defined(__TM4C123GH6PM__)
		#define __TIVA__
	#elif defined(__MSP430_CPU__)
		#define __MSP430__
	#endif

//#elif

#endif

#endif

//http://forum.stellarisiti.com/topic/1983-howto-porting-libraries-some-help-needed/
//Environment/library
//	ENERGIA - Energia environment (Tiva/CC3200/MSP430/C2000 )
//	CORE_TEENSY - TeensyDuino (AVR/ )
//	MAPLE_IDE - libmaple (STM32)
//	MPIDE - chipKIT
//	ARDUINO - (AVR/SAM/x86/...) - also defined by other environments, like ENERGIA.
//
//	Processor family:
//__MSP430_CPU__ or __MSP430_HEADER_VERSION__ - MSP430
//	__arm__ - Should be true for any ARM processor (e.g. Tiva, Stellaris, CC3200, SAM/Arduino Due, STM32, Freescale, ... )
//	__AVR__ - Atmel AVR processors (original Arduino, Teensy before version 3, etc.)
//	__ARDUINO_X86__ - Intel x86/Galileo
//
//	Board: (Arduino 1.5.7 BETA)
//	ARDUINO_SAM_DUE - Arduino Due
//	ARDUINO_AVR_xxx (YUN, LEONARDO, MEGA, ....) - Various AVR Arduinos
