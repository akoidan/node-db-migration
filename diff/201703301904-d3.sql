CREATE TABLE blocked_addresses (
    id BIGINT PRIMARY KEY NOT NULL,
    lat DECIMAL(10,8), -- lat of blocked address
    lng DECIMAL(11,8), -- lng of blocked address
    address varchar(100000), -- string-like address which is being blocked
    description varchar(255) -- reason of why is this address blocked
);

