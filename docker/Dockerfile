# Obsyncth CORS Proxy Container
# Copyright (c) 2024-2025 Reza Mir
# 
# Nginx proxy for enabling CORS access to Syncthing from web browsers

FROM nginx:alpine

WORKDIR /etc/nginx
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8384
EXPOSE 80
EXPOSE 8380

ENTRYPOINT [ "nginx" ]
CMD [ "-g", "daemon off;" ]