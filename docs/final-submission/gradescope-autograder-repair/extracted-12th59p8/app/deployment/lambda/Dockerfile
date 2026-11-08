FROM public.ecr.aws/lambda/nodejs:22 AS build
RUN dnf install -y zip && dnf clean all
WORKDIR /var/task
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/ server/
COPY shared/ shared/
COPY scripts/smoke-lambda.mjs /verify/smoke-lambda.mjs
ENV AWS_EC2_METADATA_DISABLED=true
RUN node /verify/smoke-lambda.mjs
RUN mkdir -p /out && zip -q -r /out/unframe-lambda-node22-x64.zip package.json package-lock.json server shared node_modules

FROM scratch AS artifact
COPY --from=build /out/ /
