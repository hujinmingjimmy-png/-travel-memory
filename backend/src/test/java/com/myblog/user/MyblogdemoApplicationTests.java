package com.myblog.user;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@ActiveProfiles("test")
@SpringBootTest(properties = {
		"spring.datasource.url=jdbc:mysql://127.0.0.1:1/travel_memory_test",
		"spring.datasource.username=test",
		"spring.datasource.password=test",
		"jwt.secret=travel-memory-test-signing-key-at-least-32-bytes"
})
class MyblogdemoApplicationTests {

	@Test
	void contextLoads() {
	}

}
