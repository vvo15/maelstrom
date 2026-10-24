FROM php:8.3-apache

# Enable mod_rewrite for clean URLs
RUN a2enmod rewrite headers

# Copy site files
COPY . /var/www/html/

# Apache config: enforce DECOY_HEADERS, allow .htaccess overrides
RUN echo 'ServerName localhost' >> /etc/apache2/apache2.conf
COPY apache.conf /etc/apache2/sites-available/000-default.conf

EXPOSE 80
