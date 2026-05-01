# Neo4j Database Server

Neo4j runs in Docker. Credentials are in `.env` and must match `NEO4J_AUTH` used when the container was created.

## First-time setup

```bash
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/change-me \
  neo4j:latest
```

- Browser UI: http://localhost:7474
- Bolt (app): `bolt://localhost:7687`
- Default credentials: `neo4j` / `change-me`

Data is lost when the container is removed. To persist it across removals:

```bash
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/change-me \
  -v $HOME/neo4j-data:/data \
  neo4j:latest
```

## Daily usage

```bash
docker start neo4j      # start
docker stop neo4j       # stop
docker restart neo4j    # restart
docker logs neo4j       # view logs
```

## npm scripts

| Command | What it does |
|---|---|
| `npm run db:reset` | Wipes all application data |
| `npm run db:seed` | Seeds initial data |
| `npm run db:fresh` | Reset + seed (full wipe and reload) |

## Authentication errors

If you get `Neo.ClientError.Security.Unauthorized`, the container was created with a different password than what's in `.env`. Fix it by removing and recreating:

```bash
docker rm neo4j
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/change-me \
  neo4j:latest
```

Wait ~10 seconds for Neo4j to initialize before running any `npm run db:*` commands.

## Port conflicts

If ports 7474 or 7687 are in use:

```bash
docker ps                          # check what's running
docker stop <conflicting-container>
```
