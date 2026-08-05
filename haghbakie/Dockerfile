FROM python:3.11-slim

# متغیرهای محیطی
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# نصب ابزارهای مورد نیاز
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

# پورت پیش‌فرض
EXPOSE 8000

# اجرای بات
CMD ["python", "bot.py"]
