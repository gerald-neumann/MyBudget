# Build from repository root:
#   docker build -f backend/MyBudget.Api/Dockerfile -t mybudget-api .
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
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
