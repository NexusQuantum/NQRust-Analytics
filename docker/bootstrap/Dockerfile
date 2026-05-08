FROM busybox

WORKDIR /app
COPY init.sh ./

# Normalize CRLF -> LF (in case init.sh was edited on Windows) and ensure executable
RUN sed -i 's/\r$//' /app/init.sh && chmod +x /app/init.sh