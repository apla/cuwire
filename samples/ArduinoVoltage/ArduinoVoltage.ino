/*
	ReadAnalogVoltage
	Reads an analog input on pin 0, converts it to voltage, and prints the result to the serial monitor.
	Attach the center pin of a potentiometer to pin A0, and the outside pins to +5V and ground.

 This example code is in the public domain.
 */

// http://provideyourown.com/2012/secret-arduino-voltmeter-measure-battery-voltage/

//float internal11Ref = 1.1 * Vcc1 (per voltmeter) / Vcc2 (per readVcc() function)
#define internal11Ref 1.1

#define scale_constant internal11Ref * 1023 * 1000

long readVcc() {
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

	delay(2); // Wait for Vref to settle
	ADCSRA |= _BV(ADSC); // Start conversion
	while (bit_is_set(ADCSRA,ADSC)); // measuring

	uint8_t low  = ADCL; // must read ADCL first - it then locks ADCH
	uint8_t high = ADCH; // unlocks both

	long result = (high<<8) | low;

	result = scale_constant / result; // Calculate Vcc (in mV); 1125300 = 1.1*1023*1000
	return result; // Vcc in millivolts
}

// the setup routine runs once when you press reset:
void setup() {
	// initialize serial communication at 9600 bits per second:
	Serial.begin(9600);
	pinMode(13, OUTPUT);
	analogReference(INTERNAL);
}

// the loop function runs over and over again forever
void loop() {
	digitalWrite(13, HIGH);   // turn the LED on (HIGH is the voltage level)
	delay(1000);              // wait for a second
	digitalWrite(13, LOW);    // turn the LED off by making the voltage LOW
	// read the input on analog pin 0:
	int sensorValue = analogRead(A0);
	// Convert the analog reading (which goes from 0 - 1023) to a voltage (0 - 5V):
	long voltage = readVcc();
	// print out the value you read:
	Serial.print(voltage);
	Serial.println(" mV");
	delay(5000);
}
