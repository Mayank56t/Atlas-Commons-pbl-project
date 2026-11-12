import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Research Collaboration Platform — Java Spring Boot integration service.
 *
 * This is intentionally a single-file application. Its only job is:
 *
 *   GET http://localhost:8081/api/java/status
 *
 * which performs a REAL HTTP request to the Python FastAPI health endpoint
 * (http://localhost:8000/api/health) and reports whether the Python service
 * is reachable. If the Python service is down, an appropriate error response
 * (503) is returned instead of crashing.
 *
 * All authentication, JWT handling, PostgreSQL access and CRUD are
 * implemented in the Python FastAPI service — never here.
 *
 * Note: component scanning is narrowed to an (empty) package on purpose —
 * every bean this app needs is declared explicitly below, which keeps this
 * single source file fully self-contained.
 */
@SpringBootApplication(scanBasePackages = "com.research.platform.none")
public class ResearchPlatformApplication {

    /** Base URL of the FastAPI service (override with the FASTAPI_URL env var). */
    private static final String FASTAPI_BASE_URL =
            System.getenv().getOrDefault("FASTAPI_URL", "http://localhost:8000");

    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(ResearchPlatformApplication.class);
        // Default port 8081 (suggested local port). No application.properties
        // file is used, keeping this a single-source-file application.
        app.setDefaultProperties(Map.of("server.port", "8081"));
        app.run(args);
    }

    /** Register the REST controller explicitly as a bean. */
    

    @RestController
    public static class PythonStatusController {

        private final HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();

        @GetMapping("/api/java/status")
        public ResponseEntity<Map<String, Object>> status() {
            String healthUrl = FASTAPI_BASE_URL + "/api/health";

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("service", "spring-boot");
            result.put("fastapiUrl", healthUrl);

            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(healthUrl))
                        .timeout(Duration.ofSeconds(3))
                        .GET()
                        .build();

                HttpResponse<String> response =
                        httpClient.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() == 200) {
                    result.put("status", "UP");
                    result.put("python", "UP");
                    result.put("pythonStatusCode", response.statusCode());
                    result.put("pythonResponse", response.body());
                    return ResponseEntity.ok(result);
                }

                result.put("status", "DEGRADED");
                result.put("python", "DOWN");
                result.put("pythonStatusCode", response.statusCode());
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(result);

            } catch (Exception ex) {
                // Python service connection failure -> clean error response.
                result.put("status", "DOWN");
                result.put("python", "DOWN");
                result.put("error", "Cannot reach the Python FastAPI service: "
                        + ex.getMessage());
                return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(result);
            }
        }
    }
}
