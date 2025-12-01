This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Start analytics-ui from source code

Step 1. Make sure your node version is 18
```bash
node -v
```

Step 2. Install dependencies:

```bash
yarn 
```

Step 3(Optional). Switching database

Analytics-ui uses SQLite as our default database. To use Postgres as the database of analytics-ui, you need to set the two environment variable below.

```bash
# windows
SET DB_TYPE=pg
SET PG_URL=postgres://user:password@localhost:5432/dbname 

# linux or mac
export DB_TYPE=pg
export PG_URL=postgres://user:password@localhost:5432/dbname
```
-  `PG_URL` is the connection string of your postgres database.

To switch back to using SQLite, you can reassign the `DB_TYPE` to `sqlite`.
```
# windows
SET DB_TYPE=sqlite
SET SQLITE_FILE={your_sqlite_file_path} # default is ./db.sqlite3

# linux or mac
export DB_TYPE=sqlite
export SQLITE_FILE={your_sqlite_file_path}
```

Step 4. Run migrations:

```bash
yarn migrate
# or
npm run migrate
```


Step 5. Run the development server:

```bash
# Execute this if you start analytics-engine and ibis-server via docker
# Linux or MacOS
export OTHER_SERVICE_USING_DOCKER=true
export EXPERIMENTAL_ENGINE_RUST_VERSION=false # set to true if you want to use the experimental Rust version of the Analytics Engine
# Windows
SET OTHER_SERVICE_USING_DOCKER=true
SET EXPERIMENTAL_ENGINE_RUST_VERSION=false # set to true if you want to use the experimental Rust version of the Analytics Engine

# Run the development server
yarn dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.


## Development analytics-ui module on local
There are many modules in Analytics AI, to develop analytics-ui, you can start other modules(services) via docker-compose.
In the [Start analytics-ui from source code](#Start-analytics-ui-from-source-code) section, you've know how to start analytics-ui from the source code to develop.
To start other modules via docker-compose, you can follow the steps below.

Step 1. Prepare you .env file
In the AnalyticsAI/docker folder, you can find the .env.example file. You can copy this file to .env.local file.

```bash
# assume current directory is analytics-ui
cd ../docker
cp .env.example .env.local
```
Step 2. Modify your .env.local file
You need to fill the `OPENAI_API_KEY` with your OPENAI api key before starting.

You can also change the `ANALYTICS_ENGINE_VERSION`, `ANALYTICS_AI_SERVICE_VERSION`, `IBIS_SERVER_VERSION` to the version you want to use.


Step 3. Start the services via docker-compose
```bash
# current directory is AnalyticsAI/docker
docker-compose -f docker-compose-dev.yaml --env-file .env.example up

# you can add a -d flag to run the services in the background
docker-compose -f docker-compose-dev.yaml --env-file .env.example up -d
# then stop the services via
docker-compose -f docker-compose-dev.yaml --env-file .env.example down
```

Step 4. Start analytics-ui from source code
refer to [Start analytics-ui from source code](#Start-analytics-ui-from-source-code) section to start analytics-ui from source code.

Step 5. (Optional) Develop other modules along with analytics-ui

As mentioned above, you can use docker-compose to start other modules. The same applies when developing other modules.
From the perspective of analytics-ui, if you want to develop other modules at the same time, you can stop the container then spin up the module from the source code.

eg: If you want to develop ai-service module, you can stop the ai-service container then start the ai-service from the source code.
```yaml
# docker/docker-compose-dev.yaml
analytics-engine:
    image: ghcr.io/canner/analytics-engine:${ANALYTICS_ENGINE_VERSION}
    pull_policy: always
    platform: ${PLATFORM}
    expose:
      - ${ANALYTICS_ENGINE_SQL_PORT}
    ports:
      - ${ANALYTICS_ENGINE_PORT}:${ANALYTICS_ENGINE_PORT}
    volumes:
      - data:/usr/src/app/etc
    networks:
      - analytics
    depends_on:
      - bootstrap
    ...
# comment out the ai-service service
analytics-ai-service:
    image: ghcr.io/canner/analytics-ai-service:${ANALYTICS_AI_SERVICE_VERSION}
    pull_policy: always
    platform: ${PLATFORM}
    ports:
      - ${AI_SERVICE_FORWARD_PORT}:${ANALYTICS_AI_SERVICE_PORT}
    environment:
      ANALYTICS_UI_ENDPOINT: http://host.docker.internal:${ANALYTICS_UI_PORT}
      # sometimes the console won't show print messages,
      # using PYTHONUNBUFFERED: 1 can fix this
      PYTHONUNBUFFERED: 1
      CONFIG_PATH: /app/data/config.yaml
    env_file:
      - ${PROJECT_DIR}/.env
    volumes:
      - ${PROJECT_DIR}/config.yaml:/app/data/config.yaml
    networks:
      - analytics
    depends_on:
      - qdrant

ibis-server:
    image: ghcr.io/canner/analytics-engine-ibis:${IBIS_SERVER_VERSION}
    ...
```
Then refer to the README.md or CONTRIBUTION.md file the module for starting the module from the source code. 

eg: refer to the [ai-service README](https://github.com/Canner/AnalyticsAI/blob/main/analytics-ai-service/README.md#start-the-service-for-development) to start the ai-service from the source code.



## FAQ
### Can I have multiple project at the same time in Analytics AI?
We currently do not support multiple projects in Analytics AI. You can only have one project at a time.
But there is a workaround for this. Since Analytics Engine is stateless and we store your semantic model in the database(Sqlite or Postgres), 
you can switch between projects by switching the database and make sure you deploying after server started.

> Tip: Define the `DB_TYPE` and `SQLITE_FILE` or `PG_URL` variable to specify which database you intend to use.

eg: 
```bash
# start your first project using default database(sqlite by defulat)
yarn migrate
yarn dev

# ... after onboarding and lots of hard work, you want to switch to another project 
# stop the server

# set another sqlite file
export SQLITE_FILE=./new_project.sqlite
yarn migrate
yarn dev

# In the Browser, ... after another onboarding process and hard work
# you can switch back to the first project by setting the first sqlite file
export SQLITE_FILE=./first_project.sqlite

yarn dev  # no need to do migration again

# in the modeling page, click the deploy button to deploy the project to the analytics-ai-service.
# your Analytics AI is ready to answer your question.
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!