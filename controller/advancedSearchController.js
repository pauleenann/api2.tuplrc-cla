import { db } from "../config/db.js";

export const getAdvancedSearch = (req, res) => {
    const { initialFilter, addedFilters, selectedType } = req.query;
    console.log("Initial Filter:", initialFilter);
    console.log("Added Filters:", addedFilters);
    console.log("Selected Type:", selectedType);
    console.log("This is the advanced search endpoint");

    // Ensure initialFilter and addedFilters are parsed if they come as JSON strings
    const initialFilterObj = typeof initialFilter === 'string' ? JSON.parse(initialFilter) : initialFilter;
    const addedFiltersArr = typeof addedFilters === 'string' ? JSON.parse(addedFilters) : addedFilters;

    let whereClause = [];

    // Function to map frontend filter names to actual database column names
    const handleFilter = (filterName) => {
        const columnMap = {
            'title': 'resources.resource_title',
            'ISBN': 'book.book_isbn',
            'publisher': 'publisher.pub_name',
            'publication year': 'resources.resource_published_date',
            'author': 'CONCAT(author.author_fname, " ", author.author_lname)',
            'department': 'department.dept_name',
            'topic': 'topic.topic_name'
        };
        return columnMap[filterName] || 'resources.resource_title';
    };

    // Convert `initialFilter` to a WHERE clause
    if (initialFilterObj && initialFilterObj.filter && initialFilterObj.condition && initialFilterObj.input) {
        let column = handleFilter(initialFilterObj.filter);
        let condition = initialFilterObj.condition;
        let value = initialFilterObj.input;

        if (condition === 'contains') {
            whereClause.push(`${column} LIKE '%${value}%'`);
        } else if (condition === 'starts with') {
            whereClause.push(`${column} LIKE '${value}%'`);
        } else if (condition === 'equals') {
            whereClause.push(`${column} = '${value}'`);
        }
    }

    // Convert `addedFilters` array to WHERE clauses
    if (addedFiltersArr && addedFiltersArr.length > 0) {
        addedFiltersArr.forEach((filter) => {
            let column = handleFilter(filter.filter);
            let condition = filter.condition;
            let value = filter.input;
            let logic = filter.logic.toUpperCase(); // AND/OR

            let queryCondition = "";

            if (condition === 'contains') {
                queryCondition = `${column} LIKE '%${value}%'`;
            } else if (condition === 'starts with') {
                queryCondition = `${column} LIKE '${value}%'`;
            } else if (condition === 'equals') {
                queryCondition = `${column} = '${value}'`;
            }

            whereClause.push(`${logic} ${queryCondition}`);
        });
    }

    // Convert `selectedType` to a WHERE clause
    if (selectedType && selectedType != 'any') {
        whereClause.push(`AND resourcetype.type_name = '${selectedType}'`);
    }

    // Join all conditions into a valid SQL WHERE clause
    let whereSQL = whereClause.length > 0 ? `WHERE ${whereClause.join(" ")}` : "";

    // SQL query
    const q = `
        SELECT 
            resources.resource_quantity,
            resources.resource_title,
            resources.resource_id, 
            resources.original_resource_quantity,
            resources.resource_quantity,
            resourcetype.type_name,
            department.dept_name,
            topic.topic_name,
            resources.resource_published_date,
            CASE
                WHEN resources.type_id = 1 THEN book.filepath
                WHEN resources.type_id IN (2, 3) THEN journalnewsletter.filepath
                ELSE NULL
            END AS filepath,
            GROUP_CONCAT(CONCAT(author.author_fname, ' ', author.author_lname) SEPARATOR ', ') AS author_names,
            publisher.pub_name
        FROM resources
        JOIN resourcetype ON resourcetype.type_id = resources.type_id
        JOIN department ON department.dept_id = resources.dept_id
        LEFT JOIN book ON book.resource_id = resources.resource_id
        LEFT JOIN publisher ON publisher.pub_id = book.pub_id
        LEFT JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
        LEFT JOIN topic ON COALESCE(book.topic_id, journalnewsletter.topic_id) = topic.topic_id
        LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
        LEFT JOIN author ON resourceauthors.author_id = author.author_id
        ${whereSQL}
        GROUP BY 
            resources.resource_id, 
            resources.resource_title, 
            resources.type_id, 
            resources.resource_quantity,
            resourcetype.type_name,
            department.dept_name,
            topic.topic_name,
            resources.resource_published_date;
    `;

    // Execute SQL query
    db.query(q, (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).json({ error: "Database query failed" });
        }
        console.log(results)
        res.json(results);
    });
};

export const getAdvancedSearchOnlineCatalog = (req, res) => {
    const { initialFilter, addedFilters, selectedType } = req.query;
    console.log("Initial Filter:", initialFilter);
    console.log("Added Filters:", addedFilters);
    console.log("Selected Type:", selectedType);
    console.log("This is the advanced search endpoint");

    // Ensure initialFilter and addedFilters are parsed if they come as JSON strings
    const initialFilterObj = typeof initialFilter === 'string' ? JSON.parse(initialFilter) : initialFilter;
    const addedFiltersArr = typeof addedFilters === 'string' ? JSON.parse(addedFilters) : addedFilters;

    let whereClause = [];

    // Function to map frontend filter names to actual database column names
    const handleFilter = (filterName) => {
        const columnMap = {
            'title': 'resources.resource_title',
            'ISBN': 'book.book_isbn',
            'publisher': 'publisher.pub_name',
            'publication year': 'resources.resource_published_date',
            'author': 'CONCAT(author.author_fname, " ", author.author_lname)',
            'department': 'department.dept_name',
            'topic': 'topic.topic_name'
        };
        return columnMap[filterName] || 'resources.resource_title';
    };

    // Convert `initialFilter` to a WHERE clause
    if (initialFilterObj && initialFilterObj.filter && initialFilterObj.condition && initialFilterObj.input) {
        let column = handleFilter(initialFilterObj.filter);
        let condition = initialFilterObj.condition;
        let value = initialFilterObj.input;

        if (condition === 'contains') {
            whereClause.push(`${column} LIKE '%${value}%'`);
        } else if (condition === 'starts with') {
            whereClause.push(`${column} LIKE '${value}%'`);
        } else if (condition === 'equals') {
            whereClause.push(`${column} = '${value}'`);
        }
    }

    // Convert `addedFilters` array to WHERE clauses
    if (addedFiltersArr && addedFiltersArr.length > 0) {
        addedFiltersArr.forEach((filter) => {
            let column = handleFilter(filter.filter);
            let condition = filter.condition;
            let value = filter.input;
            let logic = filter.logic.toUpperCase(); // AND/OR

            let queryCondition = "";

            if (condition === 'contains') {
                queryCondition = `${column} LIKE '%${value}%'`;
            } else if (condition === 'starts with') {
                queryCondition = `${column} LIKE '${value}%'`;
            } else if (condition === 'equals') {
                queryCondition = `${column} = '${value}'`;
            }

            whereClause.push(`${logic} ${queryCondition}`);
        });
    }

    // Convert `selectedType` to a WHERE clause
    if (selectedType && selectedType != 'any') {
        whereClause.push(`AND resourcetype.type_name = '${selectedType} AND resources.resource_is_archived = 0'`);
    }

    // Join all conditions into a valid SQL WHERE clause
    let whereSQL = whereClause.length > 0 ? `WHERE ${whereClause.join(" ")}` : "";

    // SQL query
    const q = `
        SELECT 
            resources.resource_quantity,
            resources.resource_title,
            resources.resource_id, 
            resources.type_id,
            resources.resource_published_date,
            CASE
                WHEN resources.type_id = '1' THEN book.filepath
                WHEN resources.type_id IN ('2', '3') THEN journalnewsletter.filepath
                ELSE NULL
            END AS filepath,
            (SELECT CONCAT(author.author_fname, ' ', author.author_lname) 
            FROM resourceauthors 
            JOIN author ON resourceauthors.author_id = author.author_id
            WHERE resourceauthors.resource_id = resources.resource_id
            ORDER BY author.author_id ASC
            LIMIT 1) AS authors 
        FROM resources
        LEFT JOIN book ON book.resource_id = resources.resource_id
        LEFT JOIN journalnewsletter ON journalnewsletter.resource_id = resources.resource_id
        LEFT JOIN resourceauthors ON resourceauthors.resource_id = resources.resource_id
        LEFT JOIN author ON resourceauthors.author_id = author.author_id
        ${whereSQL}
        GROUP BY resources.resource_id, resources.resource_title, resources.type_id
    `;

    // Execute SQL query
    db.query(q, (err, results) => {
        if (err) {
            console.error("Database query error:", err);
            return res.status(500).json({ error: "Database query failed" });
        }
        console.log(results)
        res.json(results);
    });
};
