/*
	ReadAnalogVoltage
	Reads an analog input on pin 0, converts it to voltage, and prints the result to the serial monitor.
	Attach the center pin of a potentiometer to pin A0, and the outside pins to +5V and ground.

 This example code is in the public domain.
 */

// actually, arduino IDE inserts includes just before first statement
// but RFDUINO definition is in variants/RFduino/variant.h,
// so we insert a dummy string here

int dummyIntForRfduino;

// __RFduino__ ??
#ifdef RFDUINO
#include <RFduinoBLE.h>
#endif

// http://provideyourown.com/2012/secret-arduino-voltmeter-measure-battery-voltage/

//float internal11Ref = 1.1 * Vcc1 (per voltmeter) / Vcc2 (per readVcc() function)
#define internal11Ref 1.1

#define scale_constant internal11Ref * 1023 * 1000

// http://stackoverflow.com/questions/17723733/arduino-due-conditional-compilation-constant-for-custom-library

// stellaris http://energia.nu/reference/analogreference/
// http://forum.43oh.com/topic/2829-reference-voltage-for-analogread/
// http://forum.stellarisiti.com/topic/684-stellaris-fast-analog-reads/

void
	setupVcc() {
#ifdef __AVR__
	#ifdef INTERNAL1V1
	analogReference(INTERNAL1V1);
	#elif INTERNAL
	analogReference(INTERNAL);
	#endif
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

#endif
#ifdef RFDUINO

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

#endif
	return 0;
}

#if defined(__AVR__)
#define LED_X LED_BUILTIN
#elif defined(__RFduino__)
#define LED_X 2
#elif defined(__MSP430_CPU__)
#define LED_X RED_LED
#endif


// the setup routine runs once when you press reset:
void setup() {
	// initialize serial communication at 9600 bits per second:
	Serial.begin(9600);
	pinMode(LED_X, OUTPUT);

	setupVcc();
}

int delaySeconds = 5;

// the loop function runs over and over again forever
void loop() {

	if (Serial.available())
	{
		char ch = Serial.read();
		if (ch >= '1' && ch <= '7')
		{
			delaySeconds = ch - '0';

			Serial.print("Now delay is ");
			Serial.print(delaySeconds);
			Serial.println(ch == '1' ? " second": " seconds");
		}
	}

	digitalWrite(LED_X, HIGH);   // turn the LED on (HIGH is the voltage level)
	delay(100);              // wait for a second
	digitalWrite(LED_X, LOW);    // turn the LED off by making the voltage LOW
	// read the input on analog pin 0:
	//	int sensorValue = analogRead(A0);
	// Convert the analog reading (which goes from 0 - 1023) to a voltage (0 - 5V):
	long voltage = readVcc();
	// print out the value you read:
	Serial.print(voltage);
	Serial.println(" mV");

	delay(delaySeconds * 1000);
}
