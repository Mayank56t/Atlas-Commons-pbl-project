cd research-collaboration-platform   
cd python-service      
uvicorn main:app --host 127.0.0.1 --port 8000 --reload



cd research-collaboration-platform   
cd spring-boot            
mvn spring-boot:run "-Dspring-boot.run.arguments=--server.port=8081" -e       


http://localhost:8081/login.html