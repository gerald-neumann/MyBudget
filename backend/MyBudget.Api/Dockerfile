# Build from repository root:
#   docker build -f backend/MyBudget.Api/Dockerfile -t mybudget-api .
# Consolidated deploy (shared version + UTC stamp):
#   docker build --build-arg BUILD_TIMESTAMP_UTC=2026-05-15T12:00:00.000Z ...
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY Directory.Build.props VERSION ./
ARG BUILD_TIMESTAMP_UTC
RUN if [ -n "$BUILD_TIMESTAMP_UTC" ]; then printf '%s' "$BUILD_TIMESTAMP_UTC" > /src/BUILD_TIMESTAMP_UTC; fi
COPY backend/MyBudget.Api/MyBudget.Api.csproj backend/MyBudget.Api/
RUN dotnet restore backend/MyBudget.Api/MyBudget.Api.csproj
COPY backend/MyBudget.Api/ backend/MyBudget.Api/
WORKDIR /src/backend/MyBudget.Api
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
ENV DISABLE_HTTPS_REDIRECT=true
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "MyBudget.Api.dll"]
