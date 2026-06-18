FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

ARG PJSIP_VERSION=2.15.1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        libasound2-dev \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libsrtp2-dev \
        libssl-dev \
        libxext6 \
        libxrender1 \
        libxcb1 \
        pkg-config \
        python3-dev \
        swig \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/pjsip/pjproject/archive/refs/tags/${PJSIP_VERSION}.tar.gz" -o /tmp/pjproject.tar.gz \
    && tar -xzf /tmp/pjproject.tar.gz -C /tmp \
    && cd "/tmp/pjproject-${PJSIP_VERSION}" \
    && ./configure --disable-video --disable-sound --disable-opencore-amr --disable-speex-aec --with-external-srtp \
    && make dep \
    && make -j"$(nproc)" \
    && make install \
    && ldconfig \
    && cd pjsip-apps/src/swig/python \
    && make \
    && make install \
    && python -c "import pjsua2; print('pjsua2 ok')" \
    && rm -rf /tmp/pjproject.tar.gz "/tmp/pjproject-${PJSIP_VERSION}"

COPY pyproject.toml ./
COPY app ./app

RUN pip install -e '.[voice]'

EXPOSE 8084
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8084"]
