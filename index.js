const express = require('express')
const cors = require('cors')
const app = express()
const port = 3001

app.use(cors());

const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host : 'classproject.cluster-cbdo9oytyewz.us-east-2.rds.amazonaws.com',
    port : 3306,
    user : 'admin',
    password : 'admin123',
    database : 'studentemploymentdb'
  }
});

app.get('/', (req, res) => {
  res.send({
    code: 200,
    health: "Healthy"
  })
});

app.get('/get-table-data', async (req, res) => {
  var supervisors = await knex('Supervisor');

  var supervisorsWithEmployees = await Promise.all(supervisors.map(async el => {
    return knex('EmployeeSupervisorLink')
      .join('Employee', 'Employee.byuId', 'EmployeeSupervisorLink.employeeId')
      .join('EmployeePayInfo', 'Employee.byuId', 'EmployeePayInfo.employeeId')
      .where('supervisorId', el.id).then(employees => {
      return {
        supervisor: {
          firstName: el.firstName,
          lastName: el.lastName
        },
        employees: employees
      }
    })
  }));

  console.log(supervisorsWithEmployees);
  res.send(supervisorsWithEmployees);
})

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})