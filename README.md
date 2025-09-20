# legal-appointments

Implementation of a web application as a distributed online system for managing appointments for a law firm using Amazon AWS services

Preview

<p align="center">
  <img src="https://github.com/user-attachments/assets/615c6c61-05d1-42de-8c40-db534a65fd8b" alt="homepage" width="800"/><br/>
  <em>Homepage</em>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/8cc0e1e2-e7bf-44e5-8a20-9ce84368cf7a" alt="cliente" width="800"/><br/>
  <em>Client</em>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/90c3ca46-0190-4ec9-89a2-ae2bffce877d" alt="chiSiamo" width="800"/><br/>
  <em>Chi siamo</em>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/601b3dab-9f69-4739-8b2f-bde1a53e923d" alt="profilo" width="800"/><br/>
  <em>Profilo</em>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/0d69f676-73ab-4555-b52a-5e2e80bfd863" alt="admin" width="800"/><br/>
  <em>Admin</em>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/df49e1f9-88c1-4114-92a4-af9588c90657" alt="Appuntamenti del giorno" width="400"/><br/>
  <em>Appuntamenti del giorno</em>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/589df80f-29e2-45e3-9e50-38f8159bb817" alt="db" width="600"/><br/>
  <em>Dettaglio delle tabelle del DB</em>
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/175f9cc1-c8f0-4d24-9c9f-a0857303dbe4" alt="Amazon AWS RDS DB" width="800"/><br/>
  <em>Dettaglio Amazon AWS RDS DB</em>
</p>

# Configuration

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
