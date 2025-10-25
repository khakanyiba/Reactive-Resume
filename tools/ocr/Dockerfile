FROM ubuntu:20.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install Tesseract and required dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    python3-pip \
    python3-dev \
    graphicsmagick \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install flask pillow pytesseract

# Copy the OCR service script
COPY ./ocr-service.py /app/ocr-service.py

WORKDIR /app

EXPOSE 3000

CMD ["python3", "ocr-service.py"]