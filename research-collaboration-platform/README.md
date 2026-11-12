# Research Collaboration Platform

The frontend is served by **Spring Boot** on port `8081`; all authentication,
JWT validation, PostgreSQL access, and platform API logic live in the **FastAPI**
service on port `8000`. Spring Boot packages the existing `frontend/` directory
as static resources when Maven builds the application. The browser calls FastAPI
directly using Fetch API; Spring Boot does not proxy or implement API requests.

## Project structure

```text
research-collaboration-platform/
├── frontend/
│   ├── login.html
│   ├── register.html
│   ├── professor-dashboard.html
│   ├── student-dashboard.html
│   ├── api.js
│   ├── css/app.css
│   └── js/ (page behavior)
├── python-service/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   └── requirements.txt
├── spring-boot/
│   ├── pom.xml
│   └── src/main/java/ResearchPlatformApplication.java
├── .env.example
├── .gitignore
└── README.md
```

The four application tables are created by SQLAlchemy: `users`, `projects`,
`project_applications`, and `tasks`.

## Requirements on Windows

- Python 3.10+
- Java 17+ JDK
- Maven 3.9+
- PostgreSQL 13+ (running locally)

Check installations in Command Prompt:

```bat
python --version
java -version
mvn -version
psql --version
```

## 1. Create the PostgreSQL database

With PostgreSQL running and `psql` on PATH:

```bat
psql -U postgres -c "CREATE DATABASE research_platform;"
```

If your PostgreSQL username, password, host, or database name differ, use your
own connection URL in the next step. Tables are created automatically when
FastAPI starts.

## 2. Configure environment variables

From the `research-collaboration-platform` directory:

```bat
copy .env.example .env
notepad .env
```

Replace the placeholders with your local PostgreSQL URL and a long random JWT
secret. Example format (use your own password):

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/research_platform
JWT_SECRET=replace-with-a-long-random-secret-value
JWT_EXPIRATION=86400000
FASTAPI_URL=http://localhost:8000
```

`database.py` reads `.env` from the project root or the Python service folder.
FastAPI uses `DATABASE_URL`, `JWT_SECRET`, and `JWT_EXPIRATION`. Spring Boot's
FastAPI URL defaults to `http://localhost:8000`; set `FASTAPI_URL` in the
terminal environment only if the Python service is at another address.

## 3. Create and activate a Python virtual environment

In a new Command Prompt, from the project directory:

```bat
python -m venv .venv
.venv\Scripts\activate
```

For PowerShell, use `.venv\Scripts\Activate.ps1`. If script execution is blocked,
run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then activate.

## 4. Install Python dependencies and start FastAPI

Still in the activated environment and project directory:

```bat
python -m pip install -r python-service\requirements.txt
python -m uvicorn main:app --app-dir python-service --host 127.0.0.1 --port 8000
```

Leave this terminal running. FastAPI exposes the API and health endpoint at
`http://localhost:8000`. The database must be reachable before startup.

## 5. Build and start Spring Boot (serves the UI)

Open a second Command Prompt in the project directory:

```bat
cd spring-boot
mvn clean package
mvn spring-boot:run
```

Maven packages `../frontend` into `classpath:/static/`. Embedded Tomcat then
serves the original frontend files from the Spring Boot application. Open:

**http://localhost:8081/login.html**

The page scripts make direct browser requests to `http://localhost:8000`.
FastAPI CORS allows the Spring Boot frontend origin on port `8081`.

Spring Boot also exposes the required integration endpoint:

```text
GET http://localhost:8081/api/java/status
```

That endpoint makes a real HTTP request to FastAPI's `/api/health` and reports
the Python service status. If FastAPI is unreachable, Java returns HTTP `503`.

## 6. Test endpoints from Windows Command Prompt

Keep both services running. Use `curl.exe` (not PowerShell's `curl` alias).

### Health checks

```bat
curl.exe http://localhost:8000/api/health
curl.exe http://localhost:8081/api/java/status
```

### Register and log in

```bat
curl.exe -X POST http://localhost:8000/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Dr. Ada Lovelace\",\"email\":\"ada@example.edu\",\"password\":\"secret123\",\"role\":\"PROFESSOR\"}"
curl.exe -X POST http://localhost:8000/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Alan Turing\",\"email\":\"alan@example.edu\",\"password\":\"secret123\",\"role\":\"STUDENT\"}"
curl.exe -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"ada@example.edu\",\"password\":\"secret123\"}"
curl.exe -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"alan@example.edu\",\"password\":\"secret123\"}"
```

Copy each returned `token` for the commands below, replacing `<PROF_TOKEN>` and
`<STUDENT_TOKEN>` with the actual token strings.

### Projects and join applications

```bat
curl.exe -X POST http://localhost:8000/api/projects -H "Content-Type: application/json" -H "Authorization: Bearer <PROF_TOKEN>" -d "{\"title\":\"Urban water quality study\",\"description\":\"Study water quality across local urban watersheds.\",\"category\":\"Environment Research\"}"
curl.exe http://localhost:8000/api/projects -H "Authorization: Bearer <STUDENT_TOKEN>"
curl.exe "http://localhost:8000/api/projects?category=Environment%20Research" -H "Authorization: Bearer <STUDENT_TOKEN>"
curl.exe http://localhost:8000/api/projects/mine -H "Authorization: Bearer <PROF_TOKEN>"
curl.exe -X POST http://localhost:8000/api/projects/1/join -H "Authorization: Bearer <STUDENT_TOKEN>"
curl.exe -X PUT http://localhost:8000/api/applications/1 -H "Content-Type: application/json" -H "Authorization: Bearer <PROF_TOKEN>" -d "{\"status\":\"JOINED\"}"
```

### Tasks

```bat
curl.exe -X POST http://localhost:8000/api/tasks -H "Content-Type: application/json" -H "Authorization: Bearer <PROF_TOKEN>" -d "{\"projectId\":1,\"studentId\":2,\"title\":\"Collect water samples\",\"goalDescription\":\"Collect and log five water samples.\"}"
curl.exe http://localhost:8000/api/tasks -H "Authorization: Bearer <STUDENT_TOKEN>"
curl.exe -X PUT http://localhost:8000/api/tasks/1/status -H "Content-Type: application/json" -H "Authorization: Bearer <STUDENT_TOKEN>" -d "{\"status\":\"IN_PROGRESS\"}"
curl.exe -X PUT http://localhost:8000/api/tasks/1/status -H "Content-Type: application/json" -H "Authorization: Bearer <STUDENT_TOKEN>" -d "{\"status\":\"COMPLETED\"}"
```

To decline a join request, use `DELETE /api/applications/{id}` with the owning
professor's Bearer token. IDs in these examples assume a fresh database; use the
IDs returned by your own API responses if the database already contains data.

## Role workflows

- **Professor:** register/login → publish projects → review requests → approve or
  decline → assign tasks to approved students → view own project tasks.
- **Student:** register/login → browse/filter projects → request to join → see
  application status → view assigned tasks → update task status.

The frontend stores the token in `localStorage` and attaches it as a Bearer token
for protected API calls. Passwords are BCrypt-hashed; JWTs use HS256 with the
configured expiration. All project, application and task authorization rules
are enforced by FastAPI.
