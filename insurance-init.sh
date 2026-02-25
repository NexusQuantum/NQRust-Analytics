#!/bin/bash
# Downloads insurance CSV data from GitHub and loads into PostgreSQL
# Source: https://github.com/Kielx/Insurance-company-database
set -e

BASE_URL="https://raw.githubusercontent.com/Kielx/Insurance-company-database/master/01_database/dataGenerator/generatedData"

load() {
    local table=$1
    local file=$2
    echo "Loading $table from $file..."
    wget -qO- "$BASE_URL/$file" | psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
        -c "COPY $table FROM STDIN WITH (FORMAT CSV, HEADER true)"
}

# Load lookup tables first (no foreign key dependencies)
load region         region.csv
load city           city.csv
load street         street.csv
load housenr        houseNr.csv
load claimstatus    claimStatus.csv
load clienttype     clientType.csv
load insurancetype  insuranceType.csv
load phonetype      phoneType.csv
load payment        payment.csv

# Load tables that depend on lookups
load branch     branch.csv
load client     client.csv
load employee   employee.csv

# Load tables that depend on branch/client/employee
load insurance  insurance.csv
load claim      claim.csv
load phone      phone.csv

echo "Insurance database loaded successfully."
