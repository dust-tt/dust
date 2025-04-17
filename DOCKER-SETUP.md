# Dust Platform - Local Docker Setup

This guide provides instructions for setting up the Dust platform locally using Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/jamon8888/dust.git
   cd dust
   ```

2. No additional configuration is needed

3. Start the services:

   ```bash
   docker-compose up -d
   ```

4. Access the services:
   - Frontend: http://localhost:3000
   - Core API: http://localhost:3001
   - PostgreSQL: localhost:5432 (Username: dev, Password: dev)
   - Redis: localhost:6379
   - Qdrant: http://localhost:6333
   - Elasticsearch: http://localhost:9200
   - Kibana: http://localhost:5601

## Services

The Docker Compose setup includes the following services:

- **PostgreSQL**: Database for storing application data
- **Redis**: Cache and message broker
- **Qdrant**: Vector database for embeddings
- **Elasticsearch**: Search engine
- **Kibana**: Elasticsearch dashboard
- **Apache Tika**: Document parsing service
- **Core API**: Core API service
- **Frontend**: Web frontend

## Development Workflow

### Viewing Logs

To view logs for all services:

```bash
docker-compose logs -f
```

To view logs for a specific service:

```bash
docker-compose logs -f <service-name>
```

### Stopping Services

To stop all services:

```bash
docker-compose down
```

To stop all services and remove volumes:

```bash
docker-compose down -v
```

### Rebuilding Services

If you make changes to the code, you may need to rebuild the services:

```bash
docker-compose up -d --build <service-name>
```

## Troubleshooting

### Database Connection Issues

If you encounter database connection issues, ensure that the PostgreSQL service is running and healthy:

```bash
docker-compose ps
```

You can also check the logs:

```bash
docker-compose logs db
```

### Service Dependencies

The services are configured with dependencies to ensure they start in the correct order. If a service fails to start, check the logs for any dependency issues:

```bash
docker-compose logs <service-name>
```

## Additional Configuration

### Environment Variables

You can customize the environment variables in the `docker-compose.yml` file to match your requirements.

### Volumes

The Docker Compose setup uses volumes to persist data. You can find the volume configuration at the bottom of the `docker-compose.yml` file.

## Next Steps

After setting up the local development environment, you can:

1. Explore the API endpoints using tools like Postman or curl
2. Make changes to the code and see them reflected in real-time
3. Run tests to ensure everything is working correctly

For more information, refer to the main documentation in `DUST-PLATFORM-DOCUMENTATION.md`.
