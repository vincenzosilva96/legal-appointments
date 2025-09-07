# legal-appointments

Implementation of a web application as a distributed online system for managing appointments for a law firm using Amazon AWS services

To install do "npm install" and install Nginx for the server.
1)delete the fetch on the project from the "localhost" endpoint 
2)set the configuration on nginx with "sudo nano /etc/nginx/nginx.conf"
3)set on "server: server {
    listen 80;
    server_name <public-ip>;

    # Frontend static files
    location / {
        root /home/ec2-user/progetto/legal-appointments/frontend;
        index homepage.html;
        try_files $uri /homepage.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
4) go to public ip
