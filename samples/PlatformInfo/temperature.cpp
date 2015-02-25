#include <Arduino.h>

void setupTemperature (void) {
	#if defined(__RFduino__)
	#elif defined(__MSP430_CPU__)
	#elif defined(__TIVA__)
	SysCtlPeripheralEnable(SYSCTL_PERIPH_ADC0);
	SysCtlADCSpeedSet(SYSCTL_ADCSPEED_125KSPS); // 250
	ADCSequenceDisable(ADC0_BASE, 1);
	ADCSequenceConfigure(ADC0_BASE, 1, ADC_TRIGGER_PROCESSOR, 0);
	ADCSequenceStepConfigure(ADC0_BASE, 1, 0, ADC_CTL_TS);
	ADCSequenceStepConfigure(ADC0_BASE, 1, 1, ADC_CTL_TS);
	ADCSequenceStepConfigure(ADC0_BASE, 1, 2, ADC_CTL_TS);
	ADCSequenceStepConfigure(ADC0_BASE, 1, 3, ADC_CTL_TS | ADC_CTL_IE | ADC_CTL_END);
	ADCSequenceEnable(ADC0_BASE, 1);
	#endif

}

float getTemperature (void) {
	// AVR: http://playground.arduino.cc/Main/InternalTemperatureSensor
	// even better: http://www.avdweb.nl/arduino/hardware-interfacing/temperature-measurement.html
	#if defined(__RFduino__)
	//#define BUTTON_A_INPUT_PIN 5
	//#define BUTTON_B_INPUT_PIN 6
	return RFduino_temperature(CELSIUS);
//	#elif
	#elif defined(__MSP430_CPU__)
	// https://gist.github.com/apla/32267eb36f640ba61ee1
	// https://sites.google.com/site/ericstringer/home/projects/msp430launchpad/temperature-demo
	return -0.0;
	#elif defined(__TIVA__)
	SysCtlPeripheralEnable(SYSCTL_PERIPH_ADC0);
	SysCtlADCSpeedSet(SYSCTL_ADCSPEED_125KSPS); // 250
	ADCSequenceDisable(ADC0_BASE, 1);
	ADCSequenceConfigure(ADC0_BASE, 1, ADC_TRIGGER_PROCESSOR, 0);
	ADCSequenceStepConfigure(ADC0_BASE, 1, 0, ADC_CTL_TS);
	ADCSequenceStepConfigure(ADC0_BASE, 1, 1, ADC_CTL_TS);
	ADCSequenceStepConfigure(ADC0_BASE, 1, 2, ADC_CTL_TS);
	ADCSequenceStepConfigure(ADC0_BASE, 1, 3, ADC_CTL_TS | ADC_CTL_IE | ADC_CTL_END);
	ADCSequenceEnable(ADC0_BASE, 1);
	#endif
}
