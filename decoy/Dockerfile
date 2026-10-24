# Pinned on purpose: the Server banner must equal DECOY_HEADERS.server in
# shared/contracts.ts ("Apache/2.4.62 (Debian)"). Apache doesn't let mod_headers
# override Server, so the banner comes from the Apache build in this image.
FROM php:8.3.12-apache

RUN echo 'ServerName localhost' >> /etc/apache2/apache2.conf
COPY apache.conf /etc/apache2/sites-available/000-default.conf
COPY php.ini /usr/local/etc/php/conf.d/siren.ini

# Only the web root and page templates go in the image (not scripts/ or config).
COPY public/ /var/www/html/public/
COPY pages/  /var/www/html/pages/

EXPOSE 80
