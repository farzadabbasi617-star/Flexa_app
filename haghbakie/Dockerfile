FROM python:3.11-slim

# نصب ابزارهای مورد نیاز برای دیتابیس
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# نصب پکیج‌ها
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# کپی کدها
COPY . .

# اجرای بات
CMD ["python", "bot.py"]
