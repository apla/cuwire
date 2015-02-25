// measuring voltage using internal reference.
// very useful when system is running on battery

#include "voltage.h"

#include <Arduino.h>

//#include stm32l1xx_adc.h
//#include stm32l1xx_exti.h
//#include stm32l1xx_flash.h
//#include stm32l1xx_gpio.h
//#include stm32l1xx_syscfg.h
//#include stm32l1xx_lcd.h
//#include stm32l1xx_pwr.h
//#include stm32l1xx_rcc.h
//#include stm32l1xx_rtc.h
//#include misc.h

// http://provideyourown.com/2012/secret-arduino-voltmeter-measure-battery-voltage/

//float internal11Ref = 1.1 * Vcc1 (per voltmeter) / Vcc2 (per readVcc() function)
#define internal11Ref 1.1

#define scale_constant internal11Ref * 1023 * 1000

// http://stackoverflow.com/questions/17723733/arduino-due-conditional-compilation-constant-for-custom-library

// stellaris http://energia.nu/reference/analogreference/
// http://forum.43oh.com/topic/2829-reference-voltage-for-analogread/
// http://forum.stellarisiti.com/topic/684-stellaris-fast-analog-reads/

// initialization code

void
	setupVcc() {
	#ifdef __AVR__
		#ifdef INTERNAL1V1
			analogReference(INTERNAL1V1);
		#elif INTERNAL
			analogReference(INTERNAL);
		#endif
	#elif defined(STM32_MCU_SERIES)
//	http://www.micromouseonline.com/2009/05/26/simple-adc-use-on-the-stm32/
	ADC_InitTypeDef  ADC_InitStructure;
	/* PCLK2 is the APB2 clock */
	/* ADCCLK = PCLK2/6 = 72/6 = 12MHz*/
	RCC_ADCCLKConfig(RCC_PCLK2_Div6);

	/* Enable ADC1 clock so that we can talk to it */
	RCC_APB2PeriphClockCmd(RCC_APB2Periph_ADC1, ENABLE);
	/* Put everything back to power-on defaults */
	ADC_DeInit(ADC1);

	/* ADC1 Configuration ------------------------------------------------------*/
	/* ADC1 and ADC2 operate independently */
	ADC_InitStructure.ADC_Mode = ADC_Mode_Independent;
	/* Disable the scan conversion so we do one at a time */
	ADC_InitStructure.ADC_ScanConvMode = DISABLE;
	/* Don't do contimuous conversions - do them on demand */
	ADC_InitStructure.ADC_ContinuousConvMode = DISABLE;
	/* Start conversin by software, not an external trigger */
	ADC_InitStructure.ADC_ExternalTrigConv = ADC_ExternalTrigConv_None;
	/* Conversions are 12 bit - put them in the lower 12 bits of the result */
	ADC_InitStructure.ADC_DataAlign = ADC_DataAlign_Right;
	/* Say how many channels would be used by the sequencer */
	ADC_InitStructure.ADC_NbrOfChannel = 1;

	/* Now do the setup */
	ADC_Init(ADC1, &ADC_InitStructure);
	/* Enable ADC1 */
	ADC_Cmd(ADC1, ENABLE);

	/* Enable ADC1 reset calibaration register */
	ADC_ResetCalibration(ADC1);
	/* Check the end of ADC1 reset calibration register */
	while(ADC_GetResetCalibrationStatus(ADC1));
	/* Start ADC1 calibaration */
	ADC_StartCalibration(ADC1);
	/* Check the end of ADC1 calibration */
	while(ADC_GetCalibrationStatus(ADC1));
	#endif
}

long readVcc() {
	#ifdef __AVR__
	// Read 1.1V reference against AVcc
	// set the reference to Vcc and the measurement to the internal 1.1V reference
	#if defined(__AVR_ATmega32U4__) || defined(__AVR_ATmega1280__) || defined(__AVR_ATmega2560__)
		ADMUX = _BV(REFS0) | _BV(MUX4) | _BV(MUX3) | _BV(MUX2) | _BV(MUX1);
	#elif defined (__AVR_ATtiny24__) || defined(__AVR_ATtiny44__) || defined(__AVR_ATtiny84__)
		ADMUX = _BV(MUX5) | _BV(MUX0);
	#elif defined (__AVR_ATtiny25__) || defined(__AVR_ATtiny45__) || defined(__AVR_ATtiny85__)
		ADMUX = _BV(MUX3) | _BV(MUX2);
	#else
		ADMUX = _BV(REFS0) | _BV(MUX3) | _BV(MUX2) | _BV(MUX1);
	#endif

	delay(5); // Wait for Vref to settle
	ADCSRA |= _BV(ADSC); // Start conversion
	while (bit_is_set(ADCSRA,ADSC)); // measuring

	uint8_t low  = ADCL; // must read ADCL first - it then locks ADCH
	uint8_t high = ADCH; // unlocks both

	long result = (high<<8) | low;

	result = scale_constant / result; // Calculate Vcc (in mV); 1125300 = 1.1*1023*1000
	return result; // Vcc in millivolts

	#elif __RFduino__

	char out_ch[7];
	analogReference(VBG); // Sets the Reference to 1.2V band gap
	analogSelection(VDD_1_3_PS);  //Selects VDD with 1/3 prescaling as the analog source
	NRF_ADC->TASKS_START = 1;
	int sensorValue = analogRead(1); // the pin has no meaning, it uses VDD pin

	analogSelection(AIN_1_3_PS); // Selects the ananlog inputs with 1/3 prescaling as the analog source
	analogReference(DEFAULT); // switch back to default reference
	NRF_ADC->TASKS_STOP = 1;

	float batteryVoltage = sensorValue * (3.6 / 1023.0); // convert value to voltage
	snprintf(out_ch, 7, "%f", batteryVoltage);

	return sensorValue * 3.6 * 1000 / 1023;

	//	RFduinoBLE.advertisementData = out_ch;
	//	RFduinoBLE.deviceName = "b1234";
	//
	//	RFduinoBLE.begin();
	//	RFduino_ULPDelay( SECONDS(5) );
	//	RFduinoBLE.end();

	#elif __MSP430__

	// http://fixituntilitsbroken.blogspot.ru/2011/08/reading-supply-voltage-using-msp430s.html

	/** Reads the MSP430 supply voltage using the Analog to Digital Converter (ADC).
	On ez430 boards, this is approx. 3600mV
	@return Vcc supply voltage, in millivolts
	*/
	#ifdef ADC10ON

		ADC10CTL0 = SREF_1 + REFON + REF2_5V + ADC10ON + ADC10SHT_3;  // use internal ref, turn on 2.5V ref, set samp time = 64 cycles
		ADC10CTL1 = INCH_11;
		delay (1);                                     // Allow internal reference to stabilize
		ADC10CTL0 |= ENC + ADC10SC;                     // Enable conversions
		while (!(ADC10CTL0 & ADC10IFG));                // Conversion done?
		unsigned long temp = (ADC10MEM * 5000l);        // Convert raw ADC value to millivolts
		return ((unsigned int) (temp / 1024l));


	#elif ADC12ON

	/** Private helper method to setup ADC for one-shot conversion and read out value according to registers.
Inserts a delay before beginning conversion if REFON
@return the raw ADC value with the specified commands.
@todo move the VREF warmup to startup and leave on to avoid 17mSec blocking delay each time?
*/
	#define ADC_VREF_DELAY_MS 17
	unsigned int ctl0 =
	unsigned int ctl1 =
	unsigned char mctl0 =
	unsigned long vcc = (unsigned long) getAnalogInput(ctl0, ctl1, mctl0);
	unsigned long mult = vcc * 5000l;
	return ((unsigned int)(mult / 4096l));

	ADC12CTL0 = REFON + REF2_5V + ADC12ON + SHT0_15;  // turn on 2.5V ref, set samp time=1024 cycles
	ADC12CTL1 = SHP;                                  // Use sampling timer, internal ADC12OSC
	ADC12MCTL0 = SREF_1 + INCH_11;                   // Channel A10, Vcc/2
//		if (adc12ctl0 & REFON)                    // if internal reference is used...
	delay (ADC_VREF_DELAY_MS);           // 17mSec delay required to Vref capacitors
	ADC12CTL0 |= ENC;                         // Enable conversions
	ADC12CTL0 |= ADC12SC;                     // Start conversions
	while (!(ADC12IFG & 0x01));               // Conversion done?
	return ADC12MEM0;    // Read out 1st ADC value

	#endif
	#elif defined(STM32_MCU_SERIES)
	// even better:
//	http://techoverflow.net/blog/2015/01/13/reading-stm32f0-internal-temperature-and-voltage-using-chibios/

	// http://www.st.com/st-web-ui/static/active/en/resource/technical/document/application_note/DM00035957.pdf
	//	Val_VREFINT = VREFINT × 2^12 ⁄ VREF+ = VREFINT × 4096 ⁄ VDDA
	// VDDA = 3 × Val_VREFINT_CAL ⁄ Val_VREFINT <-- here it is!
	// ValTS = 3 × ValTS_bat ⁄ VDDA

//	u16 readADC1(u8 channel)
//	{
		ADC_RegularChannelConfig(ADC1, channel, 1, ADC_SampleTime_1Cycles5);
		// Start the conversion
		ADC_SoftwareStartConvCmd(ADC1, ENABLE);
		// Wait until conversion completion
		while(ADC_GetFlagStatus(ADC1, ADC_FLAG_EOC) == RESET);
		// Get the conversion value
		return ADC_GetConversionValue(ADC1);
//	}
	#endif
}
