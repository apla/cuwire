#include <vector>
#include <string>

int high = HIGH;

int* junk_int_data (void) {
	int result[10] = {1,2,3,4,5,6,7,8,9,0};
	return result;
}

template<typename T, size_t N>
	T * end(T (&ra)[N]) {
	return ra + N;
}

const std::vector<std::string>& junk_str_data (void) {

	const char *vinit[] = {"aaa", "bbb", "ccc", "ddd"};

	const std::vector<std::string> junk_strings (vinit, end(vinit)); // definition

	return junk_strings;
}


struct XXX {
	const int fn3 ();
};

// class members must be declared within class or struct
// we don't need to add prototypes for them
const int XXX::fn3 (void) {
}

void setup() {
	const std::vector<std::string> str_data = junk_str_data ();

//	for (const std::vector<std::string>::iterator it=str_data.begin(); it!=str_data.end(); ) {
//
//	}

	int *int_data = junk_int_data ();
}

void loop() {
}
