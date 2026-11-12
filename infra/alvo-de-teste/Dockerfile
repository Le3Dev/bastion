FROM nginx:stable-alpine

# Certificado autoassinado (20 dias) só para o alvo de teste local.
RUN apk add --no-cache openssl \
 && mkdir -p /etc/nginx/certs \
 && openssl req -x509 -nodes -newkey rsa:2048 -days 20 \
      -keyout /etc/nginx/certs/alvo.key -out /etc/nginx/certs/alvo.crt \
      -subj "/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,DNS:alvo-de-teste,IP:127.0.0.1"

COPY nginx.conf /etc/nginx/nginx.conf
