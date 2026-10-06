# A fixed PHP image avoids Railway Railpack's PHP-plugin download issue.
FROM composer:2 AS dependencies

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-interaction \
    --prefer-dist \
    --optimize-autoloader \
    --no-scripts

FROM php:8.2-cli-alpine

WORKDIR /app

# Laravel uses MySQL through PDO in the Railway environment.
RUN docker-php-ext-install pdo_mysql

COPY --from=dependencies /app/vendor ./vendor
COPY . .

# The Docker build context excludes Laravel's ignored runtime view-cache
# directory. Create it in the image so Blade can render Markdown mail such as
# password-reset notifications in a clean Railway deployment.
RUN mkdir -p storage/framework/views

# Generate Laravel's package-discovery cache without requiring production secrets
# while the image is being built.
RUN php artisan package:discover --ansi

EXPOSE 8080

CMD ["sh", "-c", "php artisan serve --host=0.0.0.0 --port=${PORT:-8080}"]
